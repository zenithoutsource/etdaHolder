package org.wallet.mdocnfchost

import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Simple
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.buildCborArray
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import org.multipaz.mdoc.connectionmethod.MdocConnectionMethodNfc
import org.multipaz.mdoc.engagement.DeviceEngagement
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
  // A hand-held phone on the ACR1311 often breaks NFC coupling mid-exchange. The
  // wallet stays armed and re-advertises the same DeviceEngagement, so one dropped
  // tap should not fail the whole request: retry within the tap window until a full
  // DeviceResponse arrives or the window expires. INVALID_QR fails fast.
  suspend fun present(engagementUri: String?, timeoutMs: Long = DEFAULT_TAP_TIMEOUT_MS): MdocPresentmentResult {
    if (PresentmentEngagement.isTapOnly(engagementUri)) {
      return presentFromTap(timeoutMs)
    }
    return presentFromEngagementUri(engagementUri!!, timeoutMs)
  }

  private suspend fun presentFromTap(timeoutMs: Long): MdocPresentmentResult {
    val deadline = System.currentTimeMillis() + timeoutMs
    var lastError: MdocPresentmentException? = null
    while (System.currentTimeMillis() < deadline) {
      val remaining = deadline - System.currentTimeMillis()
      try {
        val tag = try {
          PcscNfcIsoTag.waitForCard(remaining)
        } catch (error: Exception) {
          throw MdocPresentmentException("NFC_TIMEOUT", error.message ?: "NFC wait failed")
        }
        val ndefMessage = try {
          NdefType4Reader.readNdefMessage(tag)
        } finally {
          try {
            tag.close()
          } catch (_: Exception) {
          }
        }
        val engagementBytes = try {
          NfcStaticHandover.decode(ndefMessage)
        } catch (error: IllegalArgumentException) {
          throw MdocPresentmentException("INVALID_NDEF", error.message ?: "Invalid static handover NDEF")
        }
        val deviceEngagement = try {
          DeviceEngagement.fromDataItem(Cbor.decode(engagementBytes))
        } catch (error: Exception) {
          throw MdocPresentmentException("INVALID_NDEF", "Static handover NDEF is not valid DeviceEngagement CBOR")
        }
        val connectionMethod = deviceEngagement.connectionMethods
          .filterIsInstance<MdocConnectionMethodNfc>()
          .firstOrNull()
          ?: MdocConnectionMethodNfc(
            commandDataFieldMaxLength = 0xffffL,
            responseDataFieldMaxLength = 0xffffL,
          )
        val handover = NfcStaticHandover.handoverDataItem(ndefMessage)
        return attemptExchange(
          engagementBytes = engagementBytes,
          deviceEngagement = deviceEngagement,
          connectionMethod = connectionMethod,
          timeoutMs = remaining,
          handover = handover,
        )
      } catch (error: MdocPresentmentException) {
        if (error.code == "INVALID_QR" || error.code == "INVALID_NDEF") throw error
        lastError = error
        println("[host] tap attempt failed (${error.code}): ${error.message}. Waiting for another tap...")
        delayBeforeRetry()
      }
    }
    throw lastError
      ?: MdocPresentmentException("NFC_TIMEOUT", "No successful tap within the arm window")
  }

  private suspend fun presentFromEngagementUri(engagementUri: String, timeoutMs: Long): MdocPresentmentResult {
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

    val deadline = System.currentTimeMillis() + timeoutMs
    var lastError: MdocPresentmentException? = null
    while (System.currentTimeMillis() < deadline) {
      val remaining = deadline - System.currentTimeMillis()
      try {
        return attemptExchange(
          engagementBytes = engagementBytes,
          deviceEngagement = deviceEngagement,
          connectionMethod = connectionMethod,
          timeoutMs = remaining,
        )
      } catch (error: MdocPresentmentException) {
        if (error.code == "INVALID_QR") throw error
        lastError = error
        println("[host] tap attempt failed (${error.code}): ${error.message}. Waiting for another tap...")
        delayBeforeRetry()
      }
    }
    throw lastError
      ?: MdocPresentmentException("NFC_TIMEOUT", "No successful tap within the arm window")
  }

  private suspend fun delayBeforeRetry() {
    try {
      kotlinx.coroutines.delay(1_500)
    } catch (_: Exception) {
    }
  }

  private suspend fun attemptExchange(
    engagementBytes: ByteArray,
    deviceEngagement: DeviceEngagement,
    connectionMethod: MdocConnectionMethodNfc,
    timeoutMs: Long,
    handover: DataItem = Simple.NULL,
  ): MdocPresentmentResult {
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
      add(handover)
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
      val extracted = MdocResponseClaims.extract(plaintext)
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

}
