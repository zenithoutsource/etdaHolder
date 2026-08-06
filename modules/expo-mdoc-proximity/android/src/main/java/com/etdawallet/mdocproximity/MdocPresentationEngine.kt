package com.etdawallet.mdocproximity

interface MdocPresentationEngine {
  fun start(state: ProximityArmState, mdocBytes: ByteArray)
  fun processApdu(commandApdu: ByteArray): ByteArray
  fun stop()
}
