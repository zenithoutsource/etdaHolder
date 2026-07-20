package com.etdawallet.mdocproximity

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

class CompanionHostApduService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
    if (commandApdu == null || commandApdu.isEmpty()) {
      return byteArrayOf(0x6F.toByte(), 0x00)
    }

    return try {
      if (isSelectAid(commandApdu, ISO_MDOC_AID)) {
        if (CompanionSession.readArmState() == null) {
          return byteArrayOf(0x6A.toByte(), 0x82.toByte())
        }
        if (!CompanionSession.isPresentationApproved()) {
          return byteArrayOf(0x69.toByte(), 0x85.toByte())
        }
        CompanionSession.selectMdoc()
        return byteArrayOf(0x90.toByte(), 0x00)
      }

      if (isSelectAid(commandApdu, COMPANION_AID)) {
        if (CompanionSession.readArmState() == null) {
          return byteArrayOf(0x6A.toByte(), 0x82.toByte())
        }
        if (!CompanionSession.isMdocExchangeComplete()) {
          return byteArrayOf(0x69.toByte(), 0x85.toByte())
        }
        CompanionSession.selectCompanion()
        return byteArrayOf(0x90.toByte(), 0x00)
      }

      when (CompanionSession.readSelectedAid()) {
        "mdoc" -> MdocApduHandler.process(commandApdu)
        "companion" -> CompanionApduHandler.process(commandApdu)
        else -> byteArrayOf(0x6D.toByte(), 0x00)
      }
    } catch (error: Exception) {
      Log.e(TAG, "[hce] command failed", error)
      byteArrayOf(0x6F.toByte(), 0x00)
    }
  }

  override fun onDeactivated(reason: Int) {
    Log.d(TAG, "[hce] deactivated reason=$reason")
  }

  private fun isSelectAid(commandApdu: ByteArray, aid: ByteArray): Boolean {
    if (commandApdu.size < 5) return false
    if (commandApdu[0] != 0x00.toByte() || commandApdu[1] != 0xA4.toByte()) return false
    val lc = commandApdu[4].toInt() and 0xFF
    if (commandApdu.size < 5 + lc) return false
    val selectedAid = commandApdu.copyOfRange(5, 5 + lc)
    return selectedAid.contentEquals(aid)
  }

  companion object {
    private const val TAG = "CompanionHCE"
    private val ISO_MDOC_AID = byteArrayOf(
      0xA0.toByte(), 0x00, 0x00, 0x02, 0x48, 0x04, 0x00,
    )
    private val COMPANION_AID = byteArrayOf(
      0xA0.toByte(), 0x00, 0x00, 0x04, 0x54, 0x44, 0x41, 0x01, 0x00,
    )
  }
}
