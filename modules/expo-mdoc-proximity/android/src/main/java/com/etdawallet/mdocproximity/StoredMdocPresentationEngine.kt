package com.etdawallet.mdocproximity

import android.util.Log

/**
 * Bridges armed consent + stored mDOC bytes into the HCE session.
 * Full ISO 18013-5 session crypto is delegated to a Multipaz adapter (ADR 0006);
 * this engine tracks engagement and approved field ceilings until that adapter lands.
 */
object StoredMdocPresentationEngine : MdocPresentationEngine {
  private const val TAG = "StoredMdocEngine"

  private var armState: ProximityArmState? = null

  override fun start(state: ProximityArmState, mdocBytes: ByteArray) {
    if (mdocBytes.isEmpty()) {
      throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "mdocBytes is required")
    }
    if (state.approvedMdocFields.isEmpty()) {
      throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "approvedMdocFields is required")
    }
    armState = state
    Log.d(TAG, "[mdoc-engine] started credential=${state.credentialId} approvedFields=${state.approvedMdocFields.size}")
  }

  override fun processApdu(commandApdu: ByteArray): ByteArray {
    if (armState == null) return sw(0x69, 0x85)

    val multipazResponse = MultipazMdocAdapter.processApdu(commandApdu)
    if (multipazResponse != null) {
      return multipazResponse
    }

    Log.w(TAG, "[mdoc-engine] Multipaz unavailable; failing closed")
    return sw(0x69, 0x85)
  }

  override fun stop() {
    MultipazMdocAdapter.resetSession()
    armState = null
  }

  fun completePresentation(sharedFields: List<String>) {
    val fields = sharedFields.ifEmpty { armState?.approvedMdocFields.orEmpty() }
    CompanionSession.markMdocExchangeComplete()
    ProximityEventDispatcher.sendPresentationComplete(fields)
    stop()
    MdocProximityEngine.onPresentationSessionEnded()
  }

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
