package com.etdawallet.mdocproximity

import android.util.Log

object MdocApduHandler {
  private const val TAG = "MdocApdu"

  private var engine: MdocPresentationEngine? = null

  fun start(engineInstance: MdocPresentationEngine) {
    engine = engineInstance
  }

  /**
   * Gate mdoc APDUs, then hand them to Multipaz asynchronously.
   *
   * @return status words for a synchronous fail-closed reply, or null when Multipaz
   * will later invoke [sendResponse].
   */
  fun beginProcess(commandApdu: ByteArray, sendResponse: (ByteArray) -> Unit): ByteArray? {
    val state = CompanionSession.readArmState()
    if (state == null) {
      Log.w(TAG, "[hce] reject APDU unarmed")
      return sw(0x6A, 0x82)
    }
    if (!CompanionSession.isPresentationApproved() || state.approvedMdocFields.isEmpty()) {
      Log.w(TAG, "[hce] reject APDU not-approved")
      return sw(0x69, 0x85)
    }
    if (engine == null) {
      Log.w(TAG, "[hce] reject APDU engine-not-started")
      return sw(0x6A, 0x81)
    }
    if (!MultipazMdocAdapter.isAvailable()) {
      Log.w(TAG, "[hce] reject APDU adapter-unavailable")
      return sw(0x6A, 0x81)
    }
    if (MultipazPresentmentSession.deviceEngagementUri() == null) {
      Log.w(TAG, "[hce] reject APDU no-engagement-uri")
      return sw(0x6A, 0x81)
    }
    if (!MultipazPresentmentSession.isTransportListening()) {
      // Session loop is between advertise cycles; forwarding now would hit Multipaz
      // with no registered instance and the reader would stall with no response.
      Log.w(TAG, "[hce] reject APDU transport-not-listening")
      return sw(0x6A, 0x81)
    }

    val guard = guardAgainstMultipazCrash(commandApdu)
    if (guard != null) return guard

    MultipazMdocAdapter.processApduAsync(commandApdu, sendResponse)
    return null
  }

  fun stop() {
    engine?.stop()
    engine = null
  }

  /**
   * Multipaz 0.100 (and current main) has a fatal bug on every APDU error path:
   * processApdu catches, then calls failTransport() without holding its mutex, and
   * failTransport's check(mutex.isLocked) throws inside a fire-and-forget coroutine,
   * crashing the app ("failTransport called without holding lock"). Any APDU that
   * would take an error path in Multipaz must be answered here instead.
   *
   * @return status words to reply synchronously, or null when safe to forward.
   */
  private fun guardAgainstMultipazCrash(commandApdu: ByteArray): ByteArray? {
    if (commandApdu.size < 4) {
      Log.w(TAG, "[hce] reject malformed APDU len=${commandApdu.size}")
      return sw(0x6F, 0x00)
    }
    val cla = commandApdu[0].toInt() and 0xFF
    val ins = commandApdu[1].toInt() and 0xFF
    val p1 = commandApdu[2].toInt() and 0xFF
    return when (ins) {
      INS_SELECT -> {
        if (p1 != 0x04 || !isMdocAidPayload(commandApdu)) {
          // Wrong P1 hits Multipaz's unsupported-APDU path; wrong AID throws
          // NfcError. Both crash via failTransport-without-lock.
          Log.w(TAG, "[hce] reject non-mdoc SELECT p1=0x${p1.toString(16)}")
          sw(0x6A, 0x82)
        } else if (MultipazMdocAdapter.isApplicationSelected()) {
          // The reader restarted (e.g. host tap retry with the phone still in the
          // field) while the current NfcTransportMdoc is already selected;
          // forwarding trips check(!applicationSelected). Fail the old instance
          // safely (onDeactivated holds the lock) so the session loop re-advertises,
          // and let the reader's next retry hit the fresh instance.
          Log.w(TAG, "[hce] duplicate SELECT, recycling mdoc transport")
          MultipazMdocAdapter.onNfcDeactivated()
          sw(0x6F, 0x00)
        } else {
          MultipazMdocAdapter.markApplicationSelected()
          null
        }
      }
      INS_ENVELOPE -> when {
        !MultipazMdocAdapter.isApplicationSelected() -> {
          Log.w(TAG, "[hce] reject ENVELOPE before SELECT")
          sw(0x69, 0x85)
        }
        cla != 0x00 && cla != 0x10 -> {
          Log.w(TAG, "[hce] reject ENVELOPE cla=0x${cla.toString(16)}")
          sw(0x6F, 0x00)
        }
        else -> null
      }
      INS_GET_RESPONSE ->
        if (!MultipazMdocAdapter.isApplicationSelected()) {
          Log.w(TAG, "[hce] reject GET RESPONSE before SELECT")
          sw(0x69, 0x85)
        } else {
          null
        }
      else -> {
        Log.w(TAG, "[hce] reject unsupported mdoc APDU ins=0x${ins.toString(16)}")
        sw(0x6D, 0x00)
      }
    }
  }

  private fun isMdocAidPayload(commandApdu: ByteArray): Boolean {
    if (commandApdu.size < 5) return false
    val lc = commandApdu[4].toInt() and 0xFF
    if (lc != ISO_MDOC_AID.size || commandApdu.size < 5 + lc) return false
    return commandApdu.copyOfRange(5, 5 + lc).contentEquals(ISO_MDOC_AID)
  }

  private const val INS_SELECT = 0xA4
  private const val INS_ENVELOPE = 0xC3
  private const val INS_GET_RESPONSE = 0xC0

  private val ISO_MDOC_AID = byteArrayOf(
    0xA0.toByte(), 0x00, 0x00, 0x02, 0x48, 0x04, 0x00,
  )

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
