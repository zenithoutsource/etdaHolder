package com.wallet.mdocproximity

import com.etdawallet.mdocproximity.ApprovedMdocFieldCeiling
import com.etdawallet.mdocproximity.MdocIssuerAuthCertifySupport
import com.etdawallet.mdocproximity.MdocIssuerSignedExtractor
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.buildCborArray
import org.multipaz.crypto.Algorithm
import org.multipaz.crypto.EcPublicKey
import org.multipaz.crypto.EcSignature
import org.multipaz.document.buildDocumentStore
import org.multipaz.mdoc.credential.MdocCredential
import org.multipaz.mdoc.response.DeviceResponse
import org.multipaz.prompt.Reason
import org.multipaz.request.MdocRequestedClaim
import org.multipaz.securearea.CreateKeySettings
import org.multipaz.securearea.KeyAttestation
import org.multipaz.securearea.KeyInfo
import org.multipaz.securearea.SecureArea
import org.multipaz.securearea.SecureAreaRepository
import org.multipaz.storage.ephemeral.EphemeralStorage
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
object DcApiDeviceResponseBuilder {
  private const val DEVICE_AUTH_DOMAIN = "wallet-dc-api-mdoc-p256"
  private const val DEVICE_AUTH_KEY_ALIAS = "wallet-dc-api-mdoc-device-key"

  suspend fun build(
    mdocBytes: ByteArray,
    storedDocType: String?,
    approvedNamespaceKeys: List<String>,
    origin: String,
    nonce: String,
    encryptionJwkJson: String?,
    publicKey: EcPublicKey,
    sign: suspend (ByteArray) -> ByteArray,
  ): ByteArray {
    require(mdocBytes.isNotEmpty()) { "Stored mDOC bytes are required" }
    require(approvedNamespaceKeys.isNotEmpty()) { "Approved namespace keys are required" }
    require(origin.isNotBlank()) { "DC API origin is required" }
    require(nonce.isNotBlank()) { "DC API nonce is required" }

    val (docType, issuerSignedBytes) = MdocIssuerSignedExtractor.extract(mdocBytes, storedDocType)
    val requestedClaims = approvedNamespaceKeys.distinct().map { key ->
      val (namespace, identifier) = splitApprovedNamespaceKey(key)
      MdocRequestedClaim(
        id = key,
        docType = docType,
        namespaceName = namespace,
        dataElementName = identifier,
        intentToRetain = false,
        values = null,
      )
    }
    val thumbprint = encryptionJwkJson?.let { jwk ->
      DcApiHandoverCbor.sha256ThumbprintOfJwk(jwk)
        ?: throw IllegalArgumentException("DC API encryption JWK is invalid")
    }
    val sessionTranscript = buildCborArray {
      add(Simple.NULL)
      add(Simple.NULL)
      add(Cbor.decode(DcApiHandoverCbor.buildHandover(origin, nonce, thumbprint)))
    }

    val secureArea = CallbackSecureArea(publicKey, sign)
    val secureAreaRepository = SecureAreaRepository.Builder().add(secureArea).build()
    val documentStore = buildDocumentStore(
      storage = EphemeralStorage(),
      secureAreaRepository = secureAreaRepository,
    ) {}
    val document = documentStore.createDocument(
      displayName = "DC API mDOC",
      typeDisplayName = docType,
    )
    val credential = MdocCredential.createForExistingAlias(
      document = document,
      asReplacementForIdentifier = null,
      domain = DEVICE_AUTH_DOMAIN,
      secureArea = secureArea,
      docType = docType,
      existingKeyAlias = DEVICE_AUTH_KEY_ALIAS,
    )
    MdocIssuerAuthCertifySupport.certify(credential, issuerSignedBytes)

    val response = DeviceResponse.Builder(
      sessionTranscript = sessionTranscript,
      status = DeviceResponse.STATUS_OK,
    )
      .addDocument(credential, requestedClaims)
      .build()
    return Cbor.encode(response.toDataItem())
  }

  private fun splitApprovedNamespaceKey(key: String): Pair<String, String> {
    val slash = key.lastIndexOf('/')
    val parsed = if (slash > 0) {
      key.substring(0, slash) to key.substring(slash + 1)
    } else {
      ApprovedMdocFieldCeiling.splitFieldKey(key)
    }
    require(parsed.first.isNotBlank() && parsed.second.isNotBlank()) {
      "Approved namespace key is invalid"
    }
    return parsed
  }

  private class CallbackSecureArea(
    private val publicKey: EcPublicKey,
    private val signer: suspend (ByteArray) -> ByteArray,
  ) : SecureArea {
    override val identifier = "WalletDcApiCallbackSecureArea"
    override val displayName = "Hardware P-256"
    override val supportedAlgorithms = listOf(Algorithm.ESP256)

    override suspend fun createKey(alias: String?, createKeySettings: CreateKeySettings): KeyInfo {
      throw UnsupportedOperationException("DC API device keys are created outside Multipaz")
    }

    override suspend fun deleteKey(alias: String) = Unit

    override suspend fun getKeyInfo(alias: String): KeyInfo = CallbackKeyInfo(
      alias = DEVICE_AUTH_KEY_ALIAS,
      algorithm = Algorithm.ESP256,
      publicKey = publicKey,
      attestation = KeyAttestation(publicKey, null),
    )

    override suspend fun getKeyInvalidated(alias: String): Boolean = false

    override suspend fun sign(alias: String, dataToSign: ByteArray, unlockReason: Reason): EcSignature {
      val signature = signer(dataToSign)
      require(signature.size == 64) { "DC API ES256 signature must be 64-byte r||s" }
      return EcSignature(
        r = signature.copyOfRange(0, 32),
        s = signature.copyOfRange(32, 64),
      )
    }

    override suspend fun keyAgreement(alias: String, otherKey: EcPublicKey, unlockReason: Reason): ByteArray {
      throw UnsupportedOperationException("DC API mDOC device auth uses signature")
    }
  }
}

private class CallbackKeyInfo(
  alias: String,
  algorithm: Algorithm,
  publicKey: EcPublicKey,
  attestation: KeyAttestation,
) : KeyInfo(alias, algorithm, publicKey, attestation)
