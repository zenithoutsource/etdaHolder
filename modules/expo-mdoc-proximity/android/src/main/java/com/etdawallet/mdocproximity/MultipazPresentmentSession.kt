package com.etdawallet.mdocproximity

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.io.bytestring.ByteString
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.toDataItem
import org.multipaz.crypto.Algorithm
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import org.multipaz.document.Document
import org.multipaz.document.DocumentStore
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
import org.multipaz.presentment.ConsentData
import org.multipaz.presentment.CredentialSelection
import org.multipaz.presentment.Iso18013Presentment
import org.multipaz.presentment.SimplePresentmentSource
import org.multipaz.prompt.promptModelSilentConsent
import org.multipaz.request.Requester
import org.multipaz.request.TrustedRequesterIdentity
import org.multipaz.securearea.SecureAreaRepository
import org.multipaz.securearea.software.SoftwareCreateKeySettings
import org.multipaz.securearea.software.SoftwareSecureArea
import org.multipaz.storage.ephemeral.EphemeralStorage
import org.multipaz.util.toBase64Url
import java.util.concurrent.atomic.AtomicBoolean
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
  private const val MDOC_HARDWARE_DOMAIN = "wallet-mdoc-p256"
  private const val DEVICE_KEY_ALIAS = "wallet-mdoc-device-key"

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var sessionJob: Job? = null
  private val engagementUri = AtomicReference<String?>(null)
  private val sharedFields = AtomicReference<List<String>>(emptyList())
  private val transportListening = AtomicBoolean(false)

  suspend fun start(state: ProximityArmState, mdocBytes: ByteArray) {
    resetTransport()
    // Multipaz onDeactivated() launches an async coroutine that removes NFC
    // instances. Wait so a new open() is not immediately torn down.
    delay(150)
    sharedFields.set(emptyList())

    sessionJob = scope.launch {
      val launchedJob = coroutineContext[Job]
      try {
        runSession(state, mdocBytes)
      } catch (error: CancellationException) {
        throw error
      } catch (error: MdocProximityException) {
        val tag =
          if (error.code == MdocProximityErrors.DISCLOSURE_CEILING_EXCEEDED) {
            "proximity-policy"
          } else {
            "multipaz-session"
          }
        Log.e(TAG, "[$tag] presentation failed", error)
        ProximityEventDispatcher.sendError(
          error.code,
          error.message ?: "Presentation failed",
        )
      } catch (error: Throwable) {
        Log.e(TAG, "[multipaz-session] presentation failed", error)
        ProximityEventDispatcher.sendError(
          MdocProximityErrors.PROXIMITY_NOT_READY,
          error.message ?: "Multipaz presentation failed",
        )
      } finally {
        if (sessionJob === launchedJob && CompanionSession.peekArmState() == null) {
          engagementUri.set(null)
        }
      }
    }

    withTimeout(5.seconds) {
      while (engagementUri.get() == null && sessionJob?.isActive == true) {
        delay(10)
      }
    }
    if (engagementUri.get() == null) {
      resetTransport()
      throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Device engagement QR was not produced",
      )
    }
  }

  fun stop() {
    resetTransport()
    // Auth is installed at JS arm time and must survive session restart.
    // Clear only on explicit JS stop/disarm, not when regenerating DeviceEngagement.
    DeviceAuthBridge.clear()
  }

  private fun resetTransport() {
    sessionJob?.cancel()
    sessionJob = null
    engagementUri.set(null)
    sharedFields.set(emptyList())
    transportListening.set(false)
    MultipazMdocAdapter.resetSession()
  }

  fun deviceEngagementUri(): String? = engagementUri.get()

  /** True while an advertised NfcTransportMdoc instance can accept APDUs. */
  fun isTransportListening(): Boolean = transportListening.get()

  private suspend fun runSession(state: ProximityArmState, mdocBytes: ByteArray) {
    if (!DeviceAuthBridge.isReady()) {
      throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Device authentication is not pre-authorized",
      )
    }

    val (docType, issuerSignedBytes) = extractIssuerSigned(mdocBytes)
    val hardwareHandle = DeviceAuthBridge.hardwareHandle()
    if (hardwareHandle != null) {
      runHardwareSession(state, docType, issuerSignedBytes, hardwareHandle)
      return
    }

    runSoftwareEd25519Session(state, docType, issuerSignedBytes)
  }

  private suspend fun runHardwareSession(
    state: ProximityArmState,
    docType: String,
    issuerSignedBytes: ByteArray,
    hardwareHandle: String,
  ) {
    val storage = EphemeralStorage()
    val hardwareSecureArea = HardwareHandleSecureArea(hardwareHandle)
    val secureAreaRepository = SecureAreaRepository.Builder()
      .add(hardwareSecureArea)
      .build()

    val documentStore = buildDocumentStore(
      storage = storage,
      secureAreaRepository = secureAreaRepository,
    ) {}

    val documentTypeRepository = DocumentTypeRepository()
    val keyInfo = hardwareSecureArea.getKeyInfo(HardwareHandleSecureArea.KEY_ALIAS)

    val document = documentStore.createDocument(
      displayName = "Proximity mDOC",
      typeDisplayName = docType,
    )

    val credential = MdocCredential.createForExistingAlias(
      document = document,
      asReplacementForIdentifier = null,
      domain = MDOC_HARDWARE_DOMAIN,
      secureArea = hardwareSecureArea,
      docType = docType,
      existingKeyAlias = keyInfo.alias,
    )
    credential.certify(ByteString(issuerSignedBytes))

    presentArmedDocument(
      state = state,
      documentStore = documentStore,
      documentTypeRepository = documentTypeRepository,
      domain = MDOC_HARDWARE_DOMAIN,
    )
  }

  private suspend fun runSoftwareEd25519Session(
    state: ProximityArmState,
    docType: String,
    issuerSignedBytes: ByteArray,
  ) {
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

    presentArmedDocument(
      state = state,
      documentStore = documentStore,
      documentTypeRepository = documentTypeRepository,
      domain = MDOC_DOMAIN,
    )
  }

  private suspend fun presentArmedDocument(
    state: ProximityArmState,
    documentStore: DocumentStore,
    documentTypeRepository: DocumentTypeRepository,
    domain: String,
  ) {
    val presentmentSource = SimplePresentmentSource(
      documentStore = documentStore,
      documentTypeRepository = documentTypeRepository,
      showConsentPromptFn = { requester, trustedRequesterIdentity, consentData, preselected, onFocus ->
        enforceConsentCeiling(
          approvedFields = state.approvedMdocFields,
          requester = requester,
          trustedRequesterIdentity = trustedRequesterIdentity,
          consentData = consentData,
          preselectedDocuments = preselected,
          onDocumentsInFocus = onFocus,
        )
      },
      preferSignatureToKeyAgreement = true,
      domainsMdocSignature = listOf(domain),
    )

    val eDeviceKey = Crypto.createEcPrivateKey(EcCurve.P256)
    val connectionMethods = listOf(
      MdocConnectionMethodNfc(
        commandDataFieldMaxLength = 0xffffL,
        responseDataFieldMaxLength = 0xffffL,
      ),
    )
    val transportOptions = MdocTransportOptions(bleUseL2CAP = false)
    val advertisedForEngagement = connectionMethods.advertise(
      role = MdocRole.MDOC,
      transportFactory = MdocTransportFactory.Default,
      options = transportOptions,
    )

    val deviceEngagement = buildDeviceEngagement(eDeviceKey = eDeviceKey.publicKey) {
      advertisedForEngagement.forEach { addConnectionMethod(it.connectionMethod) }
      addCapability(Capability.READER_AUTH_ALL_SUPPORT, true.toDataItem())
      addCapability(Capability.EXTENDED_REQUEST_SUPPORT, true.toDataItem())
    }.toDataItem()
    advertisedForEngagement.forEach { transport ->
      try {
        transport.close()
      } catch (_: Exception) {
      }
    }

    val encodedDeviceEngagement = ByteString(Cbor.encode(deviceEngagement))
    engagementUri.set("mdoc:" + encodedDeviceEngagement.toByteArray().toBase64Url())
    CompanionSession.setNdefMessage(
      NfcStaticHandover.encode(encodedDeviceEngagement.toByteArray()),
    )
    val nfcHandover = NfcStaticHandover.handoverDataItem(
      CompanionSession.readNdefMessage()
        ?: throw MdocProximityException(
          MdocProximityErrors.PROXIMITY_NOT_READY,
          "NFC static handover NDEF is unavailable",
        ),
    )
    Log.i(TAG, "[multipaz-session] engagement URI ready")

    // Keep the same DeviceEngagement (eDeviceKey) until Cancel or DeviceResponse.
    // A missed tap fails the Multipaz transport; TimeoutCancellationException is a
    // CancellationException and used to abort this job, which cleared the URI and
    // made the next SELECT return 6A81 while JS still showed the QR.
    //
    // onSendingResponse only means the first response chunk was queued; the reader
    // still drains the rest via GET RESPONSE and can fail mid-drain. So after a
    // response is sent, keep listening for a grace window: if the reader reconnects
    // (its receive failed and it retries), serve the same approved fields again;
    // if no reconnect arrives, the reader is satisfied and we complete.
    var responseSentAtMs: Long? = null
    while (CompanionSession.readArmState() != null) {
      // Clear any stale failed NfcTransportMdoc instance, then wait: Multipaz
      // onDeactivated() removes instances in an async coroutine, and a new open()
      // started before that runs would be torn down immediately.
      MultipazMdocAdapter.onNfcDeactivated()
      delay(150)

      val advertisedTransports = connectionMethods.advertise(
        role = MdocRole.MDOC,
        transportFactory = MdocTransportFactory.Default,
        options = transportOptions,
      )
      transportListening.set(true)
      var deviceResponseSent = false
      try {
        val transport = if (responseSentAtMs == null) {
          advertisedTransports.waitForConnection(eSenderKey = eDeviceKey.publicKey)
        } else {
          val graceMs = CompanionSession.peekArmState()?.responseDrainGraceMs ?: 5_000L
          val remainingMs = responseSentAtMs + graceMs - System.currentTimeMillis()
          val reconnect = if (remainingMs > 0) {
            try {
              withTimeout(remainingMs) {
                advertisedTransports.waitForConnection(eSenderKey = eDeviceKey.publicKey)
              }
            } catch (_: TimeoutCancellationException) {
              null
            }
          } else {
            null
          }
          if (reconnect == null) {
            // No reader retry within the grace window: the drain succeeded.
            break
          }
          Log.w(TAG, "[multipaz-session] reader reconnected within drain grace, serving again")
          reconnect
        }
        Log.i(TAG, "[multipaz-session] NFC transport connected")
        ProximityEventDispatcher.sendDeviceEngaged()

        try {
          Iso18013Presentment(
            transport = transport,
            eDeviceKey = eDeviceKey,
            deviceEngagement = deviceEngagement,
            handover = nfcHandover,
            source = presentmentSource,
            keyAgreementPossible = listOf(EcCurve.P256),
            timeout = null,
            timeoutSubsequentRequests = null,
            onSendingResponse = {
              deviceResponseSent = true
              sharedFields.set(state.approvedMdocFields)
            },
          )
        } catch (error: Throwable) {
          if (error is MdocProximityException) throw error
          if (isFatalPresentmentCancellation(error)) throw error
          Log.w(TAG, "[multipaz-session] presentment failed before DeviceResponse, listening again", error)
        }

        if (deviceResponseSent) {
          responseSentAtMs = System.currentTimeMillis()
          Log.i(TAG, "[multipaz-session] DeviceResponse sent, grace-listening for reader retry")
        } else {
          Log.w(TAG, "[multipaz-session] NFC tap missed, listening again")
        }
      } catch (error: Throwable) {
        if (error is MdocProximityException) throw error
        if (isFatalPresentmentCancellation(error)) throw error
        Log.w(TAG, "[multipaz-session] NFC tap missed, listening again", error)
      } finally {
        transportListening.set(false)
        advertisedTransports.forEach { transport ->
          try {
            transport.close()
          } catch (_: Exception) {
          }
        }
      }
    }

    if (responseSentAtMs != null) {
      StoredMdocPresentationEngine.completePresentation(sharedFields.get())
    }
  }

  private fun isFatalPresentmentCancellation(error: Throwable): Boolean {
    if (error !is CancellationException) return false
    return error !is TimeoutCancellationException
  }

  private suspend fun enforceConsentCeiling(
    approvedFields: List<String>,
    requester: Requester,
    trustedRequesterIdentity: TrustedRequesterIdentity?,
    consentData: ConsentData,
    preselectedDocuments: List<Document>,
    onDocumentsInFocus: (List<Document>) -> Unit,
  ): CredentialSelection? {
    val selection = promptModelSilentConsent(
      requester,
      trustedRequesterIdentity,
      consentData,
      preselectedDocuments,
      onDocumentsInFocus,
    ) ?: return null

    val requestedKeys = ApprovedMdocFieldCeiling.requestedFieldKeys(selection)
    ProximityEventDispatcher.sendRequestReceived(requestedKeys)

    val extraCount = ApprovedMdocFieldCeiling.extraFieldCount(approvedFields, selection)
    if (extraCount > 0) {
      Log.w(TAG, "[proximity-policy] DeviceRequest exceeds consent ceiling extraFields=$extraCount")
      throw MdocProximityException(
        MdocProximityErrors.DISCLOSURE_CEILING_EXCEEDED,
        "Presentation failed — try again",
      )
    }

    return selection
  }

  private fun extractIssuerSigned(mdocBytes: ByteArray): Pair<String, ByteArray> {
    val root = Cbor.decode(mdocBytes)
    val docType = root["docType"].asTstr
    val issuerSigned = root["issuerSigned"]
    return docType to Cbor.encode(issuerSigned)
  }
}
