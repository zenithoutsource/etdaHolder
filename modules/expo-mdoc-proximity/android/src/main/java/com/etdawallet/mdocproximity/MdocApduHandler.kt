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
      return sw(0x6A, 0x82)
    }
    if (!MultipazMdocAdapter.isAvailable()) {
      Log.w(TAG, "[hce] reject APDU adapter-unavailable")
      return sw(0x6A, 0x82)
    }
    if (MultipazPresentmentSession.deviceEngagementUri() == null) {
      Log.w(TAG, "[hce] reject APDU no-engagement-uri")
      return sw(0x6A, 0x82)
    }

    MultipazMdocAdapter.processApduAsync(commandApdu, sendResponse)
    return null
  }

  fun stop() {
    engine?.stop()
    engine = null
  }

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
