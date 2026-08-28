package com.etdawallet.mdocproximity

import org.multipaz.cbor.CborMap
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.RawCbor
import org.multipaz.cose.Cose
import org.multipaz.cose.CoseNumberLabel
import org.multipaz.cose.CoseSign1

/**
 * digital-credentials.dev validates issuerAuth x5chain (COSE label 33) in unprotected headers.
 */
object MdocIssuerAuthX5Chain {
  fun hasX5Chain(issuerSignedBytes: ByteArray): Boolean = readX5Chain(issuerSignedBytes) != null

  fun requireX5Chain(issuerSignedBytes: ByteArray) {
    if (!hasX5Chain(issuerSignedBytes)) {
      throw IllegalArgumentException(
        "Stored mDOC issuerAuth is missing x5chain; claim a new mDL credential from the issuer",
      )
    }
  }

  internal fun readX5Chain(issuerSignedBytes: ByteArray): DataItem? {
    val issuerSigned = try {
      Cbor.decode(issuerSignedBytes)
    } catch (_: Exception) {
      return null
    } as? CborMap ?: return null

    val authItem = issuerSigned.optional("issuerAuth") ?: return null
    val cose = try {
      CoseSign1.fromDataItem(MdocIssuerSignedExtractor.unwrapCoseSign1Item(authItem))
    } catch (_: Exception) {
      return null
    }

    return cose.unprotectedHeaders[CoseNumberLabel(Cose.COSE_LABEL_X5CHAIN)]
      ?: cose.protectedHeaders[CoseNumberLabel(Cose.COSE_LABEL_X5CHAIN)]
  }

  private fun CborMap.optional(key: String): DataItem? = try {
    this[key]
  } catch (_: Exception) {
    null
  }
}
