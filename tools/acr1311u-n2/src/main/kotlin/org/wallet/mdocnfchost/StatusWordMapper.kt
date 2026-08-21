package org.wallet.mdocnfchost

import org.multipaz.nfc.NfcCommandFailedException

object StatusWordMapper {
  fun messageForStatus(status: Int): String {
    return when (status and 0xFFFF) {
      0x9000 -> "SELECT succeeded"
      0x6A82 -> "Wallet is not armed (SELECT returned 6A82). Open Driving Licence, tap NFC, approve consent, then scan the Waiting for tap QR before tapping the reader."
      0x6A81 -> "Wallet NFC presentment is not listening (SELECT returned 6A81). Stay on Waiting for tap and tap again. If it repeats, Cancel and Allow for a fresh QR."
      0x6985 -> "Presentation not approved (SELECT returned 6985). Complete Allow on the consent screen, wait until the engagement QR is visible, then tap. Do not rest the phone on the reader during biometric/arm."
      0x6A86 -> "Wrong P1/P2 on SELECT"
      0x6300 -> "SELECT returned 6300 (no immediate 9000). Rebuild the wallet native module so HCE answers SELECT synchronously, then retry with a fresh QR."
      else -> "Unexpected status word ${statusHex(status)}"
    }
  }

  fun codeForStatus(status: Int): String = statusHex(status)

  fun statusHex(status: Int): String = "%04X".format(status and 0xFFFF)

  /**
   * Multipaz wraps SELECT failures as "Failed while opening transport" / java.lang.Error.
   * Walk the cause chain so the page shows 6A82 / 6985 instead of that wrapper.
   */
  fun fromTransportOpenFailure(error: Throwable): MdocPresentmentException {
    var current: Throwable? = error
    val seen = mutableSetOf<Throwable>()
    while (current != null && seen.add(current)) {
      if (current is NfcCommandFailedException) {
        return MdocPresentmentException(codeForStatus(current.status), messageForStatus(current.status))
      }
      val message = current.message.orEmpty()
      when {
        message.contains("6A82", ignoreCase = true) ->
          return MdocPresentmentException("6A82", messageForStatus(0x6A82))
        message.contains("6A81", ignoreCase = true) ->
          return MdocPresentmentException("6A81", messageForStatus(0x6A81))
        message.contains("6985") ->
          return MdocPresentmentException("6985", messageForStatus(0x6985))
        message.contains("6300") ->
          return MdocPresentmentException("6300", messageForStatus(0x6300))
      }
      current = current.cause
    }
    return MdocPresentmentException(
      "SELECT_FAILED",
      error.message ?: "ISO mdoc SELECT failed",
    )
  }
}
