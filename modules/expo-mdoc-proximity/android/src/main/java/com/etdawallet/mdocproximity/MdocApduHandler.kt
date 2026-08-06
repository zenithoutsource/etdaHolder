package com.etdawallet.mdocproximity

object MdocApduHandler {
  private var engine: MdocPresentationEngine? = null

  fun start(engineInstance: MdocPresentationEngine) {
    engine = engineInstance
  }

  fun process(commandApdu: ByteArray): ByteArray {
    val state = CompanionSession.readArmState() ?: return sw(0x6A, 0x82)
    if (!CompanionSession.isPresentationApproved()) return sw(0x69, 0x85)
    if (state.approvedMdocFields.isEmpty()) return sw(0x69, 0x85)
    return engine?.processApdu(commandApdu) ?: sw(0x69, 0x85)
  }

  fun stop() {
    engine?.stop()
    engine = null
  }

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
