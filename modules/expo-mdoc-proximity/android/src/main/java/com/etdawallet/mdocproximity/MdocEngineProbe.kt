package com.etdawallet.mdocproximity

/**
 * Runtime probe for Multipaz ISO mdoc NFC data-transfer APIs.
 * Gate #2 for v1: [NfcTransportMdoc.processCommandApdu] on the HCE mdoc path.
 */
data class MdocEngineProbeResult(
  val engine: String,
  val version: String,
  val hasMdocModel: Boolean,
  val hasNfcDataTransfer: Boolean,
  val notes: String,
)

object MdocEngineProbe {
  private const val MULTIPAZ_VERSION = "0.100.0"

  fun checkCapabilities(): MdocEngineProbeResult {
    val hasNfcTransport = classExists("org.multipaz.mdoc.transport.NfcTransportMdoc")
    val hasDataTransferService = classExists("org.multipaz.compose.mdoc.MdocNfcDataTransferService")
    val hasProcessApdu = hasNfcTransport && methodExists(
      "org.multipaz.mdoc.transport.NfcTransportMdoc",
      "processCommandApdu",
      ByteArray::class.java,
      Function1::class.java,
    )

    val hasNfcDataTransfer = hasNfcTransport && hasProcessApdu

    return MdocEngineProbeResult(
      engine = "multipaz",
      version = MULTIPAZ_VERSION,
      hasMdocModel = classExists("org.multipaz.mdoc.issuerauth.Mso"),
      hasNfcDataTransfer = hasNfcDataTransfer,
      notes = buildString {
        append("NfcTransportMdoc=$hasNfcTransport; ")
        append("MdocNfcDataTransferService=$hasDataTransferService; ")
        append("processCommandApdu=$hasProcessApdu. ")
        if (hasNfcDataTransfer) {
          append("CompanionHostApduService forwards mdoc APDUs asynchronously to NfcTransportMdoc.processCommandApdu.")
        } else {
          append("Physical A26 spike required after dependency resolves in Android compile.")
        }
      },
    )
  }

  private fun classExists(name: String): Boolean =
    try {
      Class.forName(name)
      true
    } catch (_: ClassNotFoundException) {
      false
    }

  private fun methodExists(className: String, methodName: String, vararg paramTypes: Class<*>): Boolean =
    try {
      Class.forName(className).getDeclaredMethod(methodName, *paramTypes)
      true
    } catch (_: Exception) {
      false
    }
}
