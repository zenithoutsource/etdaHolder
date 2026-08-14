package com.etdawallet.mdocproximity

import android.util.Log
import org.multipaz.mdoc.transport.NfcTransportMdoc

/**
 * Bridges armed ISO AID A0000002480400 APDUs to Multipaz [NfcTransportMdoc].
 *
 * Multipaz 0.100 launches a coroutine and later invokes [sendResponse]. HostApduService
 * must return null and complete via [android.nfc.cardemulation.HostApduService.sendResponseApdu],
 * matching [org.multipaz.compose.mdoc.MdocNfcDataTransferService].
 */
object MultipazMdocAdapter {
  private const val TAG = "MultipazMdocAdapter"

  fun isAvailable(): Boolean = MdocEngineProbe.checkCapabilities().hasNfcDataTransfer

  fun deviceEngagementUri(): String? = MultipazPresentmentSession.deviceEngagementUri()

  fun resetSession() {
    onNfcDeactivated()
  }

  fun processApduAsync(commandApdu: ByteArray, sendResponse: (ByteArray) -> Unit) {
    try {
      NfcTransportMdoc.processCommandApdu(commandApdu) { responseApdu ->
        sendResponse(responseApdu)
      }
    } catch (error: Exception) {
      Log.e(TAG, "[multipaz] processCommandApdu failed", error)
      sendResponse(byteArrayOf(0x6F.toByte(), 0x00))
    }
  }

  fun onNfcDeactivated() {
    try {
      NfcTransportMdoc.onDeactivated()
    } catch (error: Exception) {
      Log.w(TAG, "[multipaz] onDeactivated failed", error)
    }
  }
}
