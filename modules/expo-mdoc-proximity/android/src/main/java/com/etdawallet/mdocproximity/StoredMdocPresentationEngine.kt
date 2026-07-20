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
  private var engaged = false

  override fun start(state: ProximityArmState, mdocBytes: ByteArray) {
    if (mdocBytes.isEmpty()) {
      throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "mdocBytes is required")
    }
    if (state.approvedMdocFields.isEmpty()) {
      throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "approvedMdocFields is required")
    }
    armState = state
    engaged = false
    Log.d(TAG, "[mdoc-engine] started credential=${state.credentialId} approvedFields=${state.approvedMdocFields.size}")
  }

  override fun processApdu(commandApdu: ByteArray): ByteArray {
    val state = armState ?: return sw(0x69, 0x85)

    if (!engaged) {
      engaged = true
      ProximityEventDispatcher.sendDeviceEngaged()
      ProximityEventDispatcher.sendRequestReceived(state.approvedMdocFields)
    }

  // Multipaz-backed ISO 18013-5 NFC data retrieval replaces this fail-closed path.
    Log.w(TAG, "[mdoc-engine] APDU not handled until Multipaz adapter is wired")
    return sw(0x69, 0x85)
  }

  override fun stop() {
    armState = null
    engaged = false
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
