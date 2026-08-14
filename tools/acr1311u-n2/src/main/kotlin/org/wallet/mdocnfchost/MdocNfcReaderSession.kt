package org.wallet.mdocnfchost

import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.buildCborArray
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import org.multipaz.mdoc.connectionmethod.MdocConnectionMethodNfc
import org.multipaz.mdoc.engagement.DeviceEngagement
import org.multipaz.mdoc.issuersigned.IssuerNamespaces
import org.multipaz.mdoc.request.buildDeviceRequest
import org.multipaz.mdoc.role.MdocRole
import org.multipaz.mdoc.sessionencryption.SessionEncryption
import org.multipaz.mdoc.transport.MdocTransportOptions
import org.multipaz.mdoc.transport.NfcTransportMdocReader

data class MdocPresentmentResult(
  val claims: Map<String, String>,
  val issuerAttestationVerified: Boolean,
  val diagnostic: String,
)

class MdocPresentmentException(
  val code: String,
  override val message: String,
) : Exception(message)

object MdocNfcReaderSession {
  suspend fun present(engagementUri: String, timeoutMs: Long = DEFAULT_TAP_TIMEOUT_MS): MdocPresentmentResult {
    val engagementBytes = try {
      EngagementParser.parseEngagementUri(engagementUri)
    } catch (error: IllegalArgumentException) {
      throw MdocPresentmentException("INVALID_QR", error.message ?: "Invalid engagement QR")
    }
    if (engagementBytes.isEmpty()) {
      throw MdocPresentmentException("INVALID_QR", "Engagement QR decoded to empty bytes")
    }

    val deviceEngagement = try {
      DeviceEngagement.fromDataItem(Cbor.decode(engagementBytes))
    } catch (error: Exception) {
      throw MdocPresentmentException("INVALID_QR", "Engagement QR is not valid DeviceEngagement CBOR")
    }

    val connectionMethod = deviceEngagement.connectionMethods
      .filterIsInstance<MdocConnectionMethodNfc>()
      .firstOrNull()
      ?: MdocConnectionMethodNfc(
        commandDataFieldMaxLength = 0xffffL,
        responseDataFieldMaxLength = 0xffffL,
      )

    val tag = try {
      PcscNfcIsoTag.waitForCard(timeoutMs)
    } catch (error: Exception) {
      throw MdocPresentmentException("NFC_TIMEOUT", error.message ?: "NFC wait failed")
    }

    val transport = NfcTransportMdocReader(
      role = MdocRole.MDOC_READER,
      options = MdocTransportOptions(bleUseL2CAP = false),
      connectionMethod = connectionMethod,
    )
    transport.setTag(tag)

    val eReaderKey = Crypto.createEcPrivateKey(EcCurve.P256)
    try {
      transport.open(eReaderKey.publicKey)
    } catch (error: Throwable) {
      try {
        transport.close()
      } catch (_: Exception) {
      }
      throw StatusWordMapper.fromTransportOpenFailure(error)
    }

    val encodedCoseKey = Cbor.encode(eReaderKey.publicKey.toCoseKey().toDataItem())
    val sessionTranscript = buildCborArray {
      add(Tagged(Tagged.ENCODED_CBOR, Bstr(engagementBytes)))
      add(Tagged(Tagged.ENCODED_CBOR, Bstr(encodedCoseKey)))
      add(Simple.NULL)
    }
    val encodedSessionTranscript = Cbor.encode(sessionTranscript)

    val sessionEncryption = SessionEncryption(
      role = MdocRole.MDOC_READER,
      eSelfKey = eReaderKey,
      remotePublicKey = deviceEngagement.eDeviceKey,
      encodedSessionTranscript = encodedSessionTranscript,
    )

    val deviceRequest = buildDeviceRequest(sessionTranscript) {
      addDocRequest(
        docType = MDL_DOCTYPE,
        nameSpaces = mapOf(
          MDL_NAMESPACE to MDL_REQUEST_FIELDS.associateWith { false },
        ),
        docRequestInfo = null,
      )
    }

    return try {
      transport.sendMessage(
        sessionEncryption.encryptMessage(
          messagePlaintext = Cbor.encode(deviceRequest.toDataItem()),
          statusCode = null,
        ),
      )
      val sessionData = kotlinx.coroutines.withTimeout(timeoutMs) {
        transport.waitForMessage()
      }
      val (plaintext, status) = sessionEncryption.decryptMessage(sessionData)
      if (plaintext == null) {
        throw MdocPresentmentException(
          "EMPTY_RESPONSE",
          "Reader received a session message with no DeviceResponse (status=$status)",
        )
      }
      val extracted = extractClaims(plaintext)
      val iacaPem = IssuerAttestation.loadOptionalPem()
      val verified = if (iacaPem.isNullOrBlank()) {
        false
      } else {
        try {
          IssuerAttestation.chainContainsIaca(extracted.issuerAuth, iacaPem)
        } catch (_: Exception) {
          false
        }
      }
      val diagnostic = when {
        iacaPem.isNullOrBlank() ->
          "DeviceResponse decrypted. Issuer attestation not verified (TEST IACA optional)."
        verified ->
          "DeviceResponse decrypted. Issuer attestation verified against local TEST IACA."
        else ->
          "DeviceResponse decrypted. Issuer attestation not verified (TEST IACA did not match x5chain)."
      }
      MdocPresentmentResult(
        claims = extracted.claims,
        issuerAttestationVerified = verified,
        diagnostic = diagnostic,
      )
    } catch (error: MdocPresentmentException) {
      throw error
    } catch (error: Exception) {
      throw MdocPresentmentException("PRESENTMENT_FAILED", error.message ?: "ISO 18013-5 presentment failed")
    } finally {
      try {
        transport.close()
      } catch (_: Exception) {
      }
    }
  }

  private data class ExtractedClaims(
    val claims: Map<String, String>,
    val issuerAuth: org.multipaz.cbor.DataItem,
  )

  private fun extractClaims(deviceResponseCbor: ByteArray): ExtractedClaims {
    val root = Cbor.decode(deviceResponseCbor)
    val documents = root["documents"].asArray
    if (documents.isEmpty()) {
      throw MdocPresentmentException("EMPTY_RESPONSE", "DeviceResponse contains no documents")
    }
    val issuerSigned = documents[0]["issuerSigned"]
    val nameSpaces = IssuerNamespaces.fromDataItem(issuerSigned["nameSpaces"])
    val mdl = nameSpaces.data[MDL_NAMESPACE].orEmpty()
    val claims = linkedMapOf<String, String>()
    for (identifier in MDL_REQUEST_FIELDS) {
      val item = mdl[identifier] ?: continue
      claims[identifier] = formatElementValue(item.dataElementValue)
    }
    if (claims.isEmpty()) {
      throw MdocPresentmentException("EMPTY_RESPONSE", "DeviceResponse did not include the three mDL fields")
    }
    return ExtractedClaims(claims, issuerSigned["issuerAuth"])
  }

  private fun formatElementValue(value: org.multipaz.cbor.DataItem): String {
    value.asTstrOrNull()?.let { return it }
    return try {
      value.asDateString.toString()
    } catch (_: Exception) {
      value.toString()
    }
  }
}

private fun org.multipaz.cbor.DataItem.asTstrOrNull(): String? = try {
  asTstr
} catch (_: Exception) {
  null
}
