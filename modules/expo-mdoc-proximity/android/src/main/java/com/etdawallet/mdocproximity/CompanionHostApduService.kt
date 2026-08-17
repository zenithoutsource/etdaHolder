package com.etdawallet.mdocproximity

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

class CompanionHostApduService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray? {
    if (commandApdu == null || commandApdu.isEmpty()) {
      return sw(0x6F, 0x00)
    }

    return try {
      if (isSelectAid(commandApdu, NdefType4Handler.NDEF_AID) ||
        CompanionSession.readSelectedAid() == "ndef"
      ) {
        return NdefType4Handler.process(commandApdu)
      }

      if (isSelectAid(commandApdu, ISO_MDOC_AID)) {
        val rawArm = CompanionSession.peekArmState()
        if (CompanionSession.readArmState() == null) {
          val reason = if (rawArm == null) "no-arm-state" else "expired"
          Log.w(TAG, "[hce] SELECT mdoc unarmed reason=$reason pid=${android.os.Process.myPid()}")
          return sw(0x6A, 0x82)
        }
        if (!CompanionSession.isPresentationApproved()) {
          Log.w(TAG, "[hce] SELECT mdoc not-approved pid=${android.os.Process.myPid()}")
          return sw(0x69, 0x85)
        }
        Log.i(TAG, "[hce] SELECT mdoc armed pid=${android.os.Process.myPid()}")
        // Samsung HCE answers 6300 if processCommandApdu returns null for SELECT.
        // Multipaz processes SELECT on Dispatchers.Default; ACR1311 cannot wait.
        // Return 9000 here and still feed SELECT to Multipaz (swallow sendResponseApdu).
        val gated = MdocApduHandler.beginProcess(commandApdu) { response ->
          val sw = if (response.size >= 2) {
            ((response[response.size - 2].toInt() and 0xFF) shl 8) or
              (response[response.size - 1].toInt() and 0xFF)
          } else {
            -1
          }
          Log.i(TAG, "[hce] swallowed deferred SELECT response sw=0x${sw.toString(16)}")
        }
        if (gated != null) return gated
        CompanionSession.selectMdoc()
        return sw(0x90, 0x00)
      }

      if (isSelectAid(commandApdu, COMPANION_AID)) {
        val armState = CompanionSession.readArmState()
        if (armState == null) {
          return sw(0x6A, 0x82)
        }
        if (armState.sharingMode == "mdoc-only") {
          return sw(0x69, 0x85)
        }
        if (!CompanionSession.isMdocExchangeComplete()) {
          return sw(0x69, 0x85)
        }
        CompanionSession.selectCompanion()
        return sw(0x90, 0x00)
      }

      when (CompanionSession.readSelectedAid()) {
        "mdoc" -> dispatchMdoc(commandApdu)
        "companion" -> CompanionApduHandler.process(commandApdu)
        else -> sw(0x6D, 0x00)
      }
    } catch (error: Exception) {
      Log.e(TAG, "[hce] command failed", error)
      sw(0x6F, 0x00)
    }
  }

  override fun onDeactivated(reason: Int) {
    val selected = CompanionSession.readSelectedAid()
    Log.i(TAG, "[hce] deactivated reason=$reason selected=$selected")
    if (selected == "mdoc") {
      MultipazMdocAdapter.onNfcDeactivated()
    }
  }

  private fun dispatchMdoc(commandApdu: ByteArray): ByteArray? {
    logMdocApdu(commandApdu)
    return MdocApduHandler.beginProcess(commandApdu) { response ->
      sendResponseApdu(response)
    }
  }

  private fun logMdocApdu(commandApdu: ByteArray) {
    val ins = if (commandApdu.size > 1) commandApdu[1].toInt() and 0xFF else -1
    val lc = if (commandApdu.size > 4) commandApdu[4].toInt() and 0xFF else -1
    Log.i(
      TAG,
      "[hce] mdoc APDU ins=0x${ins.toString(16).padStart(2, '0')} len=${commandApdu.size} lc=$lc",
    )
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

    private fun sw(sw1: Int, sw2: Int): ByteArray =
      byteArrayOf(sw1.toByte(), sw2.toByte())
  }
}
