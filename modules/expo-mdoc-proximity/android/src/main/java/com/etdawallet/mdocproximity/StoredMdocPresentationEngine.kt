package com.etdawallet.mdocproximity

import android.util.Log

/**
 * Bridges armed consent + stored mDOC bytes into the HCE session.
 * Full ISO 18013-5 session crypto is delegated to Multipaz; APDUs are
 * dispatched asynchronously from [CompanionHostApduService].
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
    Log.w(TAG, "[mdoc-engine] sync processApdu is unused; HCE must dispatch async")
    return sw(0x69, 0x85)
  }

  override fun stop() {
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
