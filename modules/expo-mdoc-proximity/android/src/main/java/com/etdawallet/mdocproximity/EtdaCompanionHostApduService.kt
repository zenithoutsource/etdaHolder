package com.etdawallet.mdocproximity

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

class EtdaCompanionHostApduService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
    if (commandApdu == null || commandApdu.isEmpty()) {
      return byteArrayOf(0x6F.toByte(), 0x00)
    }

    return try {
      if (isSelectEtdaAid(commandApdu)) {
        if (EtdaCompanionSession.readArmState() == null) {
          return byteArrayOf(0x6A.toByte(), 0x82.toByte())
        }
        return byteArrayOf(0x90.toByte(), 0x00)
      }

      EtdaCompanionApduHandler.process(commandApdu)
    } catch (error: Exception) {
      Log.e(TAG, "[hce] command failed", error)
      byteArrayOf(0x6F.toByte(), 0x00)
    }
  }

  override fun onDeactivated(reason: Int) {
    Log.d(TAG, "[hce] deactivated reason=$reason")
  }

  private fun isSelectEtdaAid(commandApdu: ByteArray): Boolean {
    if (commandApdu.size < 12) return false
    if (commandApdu[0] != 0x00.toByte() || commandApdu[1] != 0xA4.toByte()) return false
    val aid = commandApdu.copyOfRange(5, commandApdu.size)
    return aid.contentEquals(ETDA_COMPANION_AID)
  }

  companion object {
    private const val TAG = "EtdaCompanionHCE"
    private val ETDA_COMPANION_AID = byteArrayOf(
      0xA0.toByte(), 0x00, 0x00, 0x04, 0x54, 0x44, 0x41, 0x01, 0x00,
    )
  }
}
