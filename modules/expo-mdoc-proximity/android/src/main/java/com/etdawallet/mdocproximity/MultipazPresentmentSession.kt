package com.etdawallet.mdocproximity

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.io.bytestring.ByteString
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.toDataItem
import org.multipaz.crypto.Algorithm
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import org.multipaz.document.buildDocumentStore
import org.multipaz.documenttype.DocumentTypeRepository
import org.multipaz.mdoc.connectionmethod.MdocConnectionMethodNfc
import org.multipaz.mdoc.credential.MdocCredential
import org.multipaz.mdoc.engagement.Capability
import org.multipaz.mdoc.engagement.buildDeviceEngagement
import org.multipaz.mdoc.role.MdocRole
import org.multipaz.mdoc.transport.MdocTransportFactory
import org.multipaz.mdoc.transport.MdocTransportOptions
import org.multipaz.mdoc.transport.advertise
import org.multipaz.mdoc.transport.waitForConnection
import org.multipaz.presentment.Iso18013Presentment
import org.multipaz.presentment.SimplePresentmentSource
import org.multipaz.prompt.promptModelSilentConsent
import org.multipaz.securearea.SecureAreaRepository
import org.multipaz.securearea.software.SoftwareCreateKeySettings
import org.multipaz.securearea.software.SoftwareSecureArea
import org.multipaz.storage.ephemeral.EphemeralStorage
import org.multipaz.util.toBase64Url
import java.util.concurrent.atomic.AtomicReference
import kotlin.time.Duration.Companion.seconds
import kotlin.time.ExperimentalTime

/**
 * QR engagement + NFC data retrieval session backed by Multipaz.
 * Engagement URI is exposed to JS; APDUs are handled by [NfcTransportMdoc.processCommandApdu].
 */
@OptIn(ExperimentalTime::class)
object MultipazPresentmentSession {
  private const val TAG = "MultipazSession"
  private const val MDOC_DOMAIN = "wallet-mdoc-ed25519"
  private const val DEVICE_KEY_ALIAS = "wallet-mdoc-device-key"

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var sessionJob: Job? = null
  private val engagementUri = AtomicReference<String?>(null)
  private val sharedFields = AtomicReference<List<String>>(emptyList())

  suspend fun start(state: ProximityArmState, mdocBytes: ByteArray) {
    stop()
    sharedFields.set(emptyList())

    sessionJob = scope.launch {
      try {
        runSession(state, mdocBytes)
      } catch (error: Exception) {
        Log.e(TAG, "[multipaz-session] presentation failed", error)
        ProximityEventDispatcher.sendError(
          MdocProximityErrors.PROXIMITY_NOT_READY,
          error.message ?: "Multipaz presentation failed",
        )
      } finally {
        engagementUri.set(null)
        DeviceAuthBridge.clear()
      }
    }

    withTimeout(5.seconds) {
      while (engagementUri.get() == null && sessionJob?.isActive == true) {
        delay(10)
      }
    }
  }

  fun stop() {
    sessionJob?.cancel()
    sessionJob = null
    engagementUri.set(null)
    sharedFields.set(emptyList())
    MultipazMdocAdapter.resetSession()
    DeviceAuthBridge.clear()
  }

  fun deviceEngagementUri(): String? = engagementUri.get()

  private suspend fun runSession(state: ProximityArmState, mdocBytes: ByteArray) {
    if (!DeviceAuthBridge.isReady()) {
      throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Device authentication is not pre-authorized",
      )
    }

    val (docType, issuerSignedBytes) = extractIssuerSigned(mdocBytes)
    val holderPrivateKey = DeviceAuthBridge.buildPrivateKey()
      ?: throw MdocProximityException(MdocProximityErrors.PROXIMITY_NOT_READY, "Device key is unavailable")

    val storage = EphemeralStorage()
    val softwareSecureArea = SoftwareSecureArea.create(storage)
    val secureAreaRepository = SecureAreaRepository.Builder()
      .add(softwareSecureArea)
      .build()

    val documentStore = buildDocumentStore(
      storage = storage,
      secureAreaRepository = secureAreaRepository,
    ) {}

    val documentTypeRepository = DocumentTypeRepository()

    val keySettings = SoftwareCreateKeySettings.Builder()
      .setAlgorithm(Algorithm.ED25519)
      .setPrivateKey(holderPrivateKey)
      .build()
    val keyInfo = softwareSecureArea.createKey(DEVICE_KEY_ALIAS, keySettings)

    val document = documentStore.createDocument(
      displayName = "Proximity mDOC",
      typeDisplayName = docType,
    )

    val credential = MdocCredential.createForExistingAlias(
      document = document,
      asReplacementForIdentifier = null,
      domain = MDOC_DOMAIN,
      secureArea = softwareSecureArea,
      docType = docType,
      existingKeyAlias = keyInfo.alias,
    )
    credential.certify(ByteString(issuerSignedBytes))

    val presentmentSource = SimplePresentmentSource(
      documentStore = documentStore,
      documentTypeRepository = documentTypeRepository,
      showConsentPromptFn = ::promptModelSilentConsent,
      preferSignatureToKeyAgreement = true,
      domainsMdocSignature = listOf(MDOC_DOMAIN),
    )

    val eDeviceKey = Crypto.createEcPrivateKey(EcCurve.P256)
    val connectionMethods = listOf(
      MdocConnectionMethodNfc(
        commandDataFieldMaxLength = 0xffffL,
        responseDataFieldMaxLength = 0xffffL,
      ),
    )
    val transportOptions = MdocTransportOptions(bleUseL2CAP = false)
    val advertisedTransports = connectionMethods.advertise(
      role = MdocRole.MDOC,
      transportFactory = MdocTransportFactory.Default,
      options = transportOptions,
    )

    val deviceEngagement = buildDeviceEngagement(eDeviceKey = eDeviceKey.publicKey) {
      advertisedTransports.forEach { addConnectionMethod(it.connectionMethod) }
      addCapability(Capability.READER_AUTH_ALL_SUPPORT, true.toDataItem())
      addCapability(Capability.EXTENDED_REQUEST_SUPPORT, true.toDataItem())
    }.toDataItem()

    val encodedDeviceEngagement = ByteString(Cbor.encode(deviceEngagement))
    engagementUri.set("mdoc:" + encodedDeviceEngagement.toByteArray().toBase64Url())
    Log.d(TAG, "[multipaz-session] engagement URI ready")

    val transport = advertisedTransports.waitForConnection(eSenderKey = eDeviceKey.publicKey)

    ProximityEventDispatcher.sendDeviceEngaged()
    ProximityEventDispatcher.sendRequestReceived(state.approvedMdocFields)

    Iso18013Presentment(
      transport = transport,
      eDeviceKey = eDeviceKey,
      deviceEngagement = deviceEngagement,
      handover = Simple.NULL,
      source = presentmentSource,
      keyAgreementPossible = listOf(EcCurve.P256),
      onSendingResponse = {
        sharedFields.set(state.approvedMdocFields)
      },
    )

    StoredMdocPresentationEngine.completePresentation(sharedFields.get())
  }

  private fun extractIssuerSigned(mdocBytes: ByteArray): Pair<String, ByteArray> {
    val root = Cbor.decode(mdocBytes)
    val docType = root["docType"].asTstr
    val issuerSigned = root["issuerSigned"]
    return docType to Cbor.encode(issuerSigned)
  }
}
