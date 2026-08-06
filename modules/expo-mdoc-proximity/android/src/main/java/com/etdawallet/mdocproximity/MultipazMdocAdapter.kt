package com.etdawallet.mdocproximity

import android.util.Log
import java.util.concurrent.atomic.AtomicReference

/**
 * Bridges armed consent + stored mDOC bytes to Multipaz [NfcTransportMdoc] for ISO AID
 * A0000002480400 NFC data retrieval.
 *
 * Multipaz responds asynchronously via [sendResponse]; this adapter buffers the last
 * response for synchronous HostApduService return (same pattern as [CombinedNfcService]).
 */
object MultipazMdocAdapter {
  private const val TAG = "MultipazMdocAdapter"

  private val pendingResponse = AtomicReference<ByteArray?>(null)

  fun isAvailable(): Boolean = MdocEngineProbe.checkCapabilities().hasNfcDataTransfer

  fun deviceEngagementUri(): String? = MultipazPresentmentSession.deviceEngagementUri()

  fun resetSession() {
    pendingResponse.set(null)
    invokeNfcTransportOnDeactivated()
  }

  fun processApdu(commandApdu: ByteArray): ByteArray? {
    if (!isAvailable()) return null

    pendingResponse.set(null)
    try {
      invokeNfcTransportProcessApdu(commandApdu) { responseApdu ->
        pendingResponse.set(responseApdu)
      }
    } catch (error: Exception) {
      Log.e(TAG, "[multipaz] processCommandApdu failed", error)
      return null
    }

    return pendingResponse.get()
  }

  private fun invokeNfcTransportProcessApdu(
    commandApdu: ByteArray,
    sendResponse: (ByteArray) -> Unit,
  ) {
    val transportClass = Class.forName("org.multipaz.mdoc.transport.NfcTransportMdoc")
    val callbackClass = Function1::class.java
    val method = transportClass.getDeclaredMethod(
      "processCommandApdu",
      ByteArray::class.java,
      callbackClass,
    )
    method.invoke(null, commandApdu, sendResponse)
  }

  private fun invokeNfcTransportOnDeactivated() {
    if (!classExists("org.multipaz.mdoc.transport.NfcTransportMdoc")) return
    try {
      val transportClass = Class.forName("org.multipaz.mdoc.transport.NfcTransportMdoc")
      val method = transportClass.getDeclaredMethod("onDeactivated")
      method.invoke(null)
    } catch (error: Exception) {
      Log.w(TAG, "[multipaz] onDeactivated failed", error)
    }
  }

  private fun classExists(name: String): Boolean =
    try {
      Class.forName(name)
      true
    } catch (_: ClassNotFoundException) {
      false
    }
}
