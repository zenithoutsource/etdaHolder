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
    // NfcTransportMdoc is referenced directly (compile-time) by MultipazMdocAdapter,
    // so class presence is a reliable availability signal. The previous reflective
    // processCommandApdu lookup targeted the outer class, but that method lives on
    // the companion object (not @JvmStatic), so it always failed at runtime and made
    // every armed mdoc APDU reject with adapter-unavailable (6A81).
    val hasNfcTransport = classExists("org.multipaz.mdoc.transport.NfcTransportMdoc")
    val hasDataTransferService = classExists("org.multipaz.compose.mdoc.MdocNfcDataTransferService")

    val hasNfcDataTransfer = hasNfcTransport

    return MdocEngineProbeResult(
      engine = "multipaz",
      version = MULTIPAZ_VERSION,
      hasMdocModel = classExists("org.multipaz.mdoc.issuerauth.Mso"),
      hasNfcDataTransfer = hasNfcDataTransfer,
      notes = buildString {
        append("NfcTransportMdoc=$hasNfcTransport; ")
        append("MdocNfcDataTransferService=$hasDataTransferService. ")
        if (hasNfcDataTransfer) {
          append("CompanionHostApduService forwards mdoc APDUs asynchronously to NfcTransportMdoc.processCommandApdu.")
        } else {
          append("NfcTransportMdoc missing on classpath.")
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
}
