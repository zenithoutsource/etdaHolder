package com.etdawallet.mdocproximity

import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborMap
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.RawCbor
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.buildCborMap

/**
 * OID4VCI `mso_mdoc` bytes are not always an ISO 18013-5 Document map with
 * top-level `docType`. The JS parser already unwraps DeviceResponse
 * `documents[]` and issuerSigned-as-root (`nameSpaces` + `issuerAuth`).
 * Native presentment must do the same before Multipaz `MdocCredential.certify`.
 *
 * Issued `issuerAuth` is often CBOR tag 18 (COSE_Sign1). Multipaz
 * `CoseSign1.fromDataItem` requires a bare 4-element array. Tag 18 is not
 * part of the signed COSE payload, so unwrapping it does not change
 * issuerAuth verification.
 */
object MdocIssuerSignedExtractor {
  const val MDL_DOCTYPE = "org.iso.18013.5.1.mDL"
  const val MDL_NAMESPACE = "org.iso.18013.5.1"

  fun extract(mdocBytes: ByteArray, storedDocType: String? = null): Pair<String, ByteArray> {
    val root = Cbor.decode(mdocBytes)
    val document = unwrapDocument(root)
    val issuerSigned = normalizeIssuerAuth(decodeEmbeddedCbor(issuerSignedFrom(document)))
    val docType = readDocType(document)
      ?: storedDocType?.takeIf { it.isNotBlank() && it != "unknown" }
      ?: inferDocType(issuerSigned)
    return docType to Cbor.encode(issuerSigned)
  }

  /**
   * Presentment path: keep issuerAuth bytes exactly as issued (tag 18, RawCbor, x5chain).
   * Multipaz certify unwraps COSE tag 18; verifiers still need the original issuerAuth shape.
   */
  fun extractForPresentation(mdocBytes: ByteArray, storedDocType: String? = null): Pair<String, ByteArray> {
    val root = Cbor.decode(mdocBytes)
    val document = unwrapDocument(root)
    val issuerSigned = decodeEmbeddedCbor(issuerSignedFrom(document))
    val docType = readDocType(document)
      ?: storedDocType?.takeIf { it.isNotBlank() && it != "unknown" }
      ?: inferDocType(issuerSigned)
    return docType to Cbor.encode(issuerSigned)
  }

  private fun decodeEmbeddedCbor(item: DataItem): DataItem =
    when (item) {
      is RawCbor -> Cbor.decode(Cbor.encode(item))
      else -> item
    }

  private fun unwrapDocument(root: DataItem): DataItem {
    val documents = root.optional("documents") ?: return root
    return try {
      documents[0]
    } catch (_: Exception) {
      root
    }
  }

  private fun issuerSignedFrom(document: DataItem): DataItem {
    document.optional("issuerSigned")?.let { return it }
    if (document.optional("nameSpaces") != null) {
      return document
    }
    throw IllegalArgumentException("Stored mDOC is missing issuerSigned")
  }

  internal fun normalizeIssuerAuth(issuerSigned: DataItem): DataItem {
    val auth = issuerSigned.optional("issuerAuth") ?: return issuerSigned
    val unwrapped = unwrapCoseSign1Item(auth)
    if (unwrapped === auth) return issuerSigned
    return replaceIssuerAuth(issuerSigned, unwrapped)
  }

  internal fun unwrapCoseSign1Item(item: DataItem): DataItem {
    var current = item
    repeat(4) {
      when (current) {
        is Tagged -> {
          if (current.tagNumber != Tagged.COSE_SIGN1) return current
          current = current.taggedItem
        }
        is Bstr -> {
          current = try {
            Cbor.decode(current.value)
          } catch (_: Exception) {
            return current
          }
        }
        else -> return current
      }
    }
    return current
  }

  private fun replaceIssuerAuth(issuerSigned: DataItem, issuerAuth: DataItem): DataItem {
    if (issuerSigned !is CborMap) return issuerSigned
    return buildCborMap {
      issuerSigned.items.forEach { (key, value) ->
        val label = (key as? Tstr)?.value ?: return@forEach
        if (label == "issuerAuth") {
          put("issuerAuth", issuerAuth)
        } else {
          put(label, value)
        }
      }
    }
  }

  private fun readDocType(document: DataItem): String? =
    document.optional("docType")?.let { item ->
      try {
        item.asTstr
      } catch (_: Exception) {
        null
      }
    }

  private fun inferDocType(issuerSigned: DataItem): String {
    val nameSpaces = issuerSigned.optional("nameSpaces")
      ?: throw IllegalArgumentException("Stored mDOC is missing docType")
    val hasMdlNamespace = try {
      nameSpaces.asMap.keys.any { key ->
        try {
          key.asTstr == MDL_NAMESPACE
        } catch (_: Exception) {
          false
        }
      }
    } catch (_: Exception) {
      false
    }
    if (hasMdlNamespace) return MDL_DOCTYPE
    throw IllegalArgumentException("Stored mDOC is missing docType")
  }

  private fun DataItem.optional(key: String): DataItem? = try {
    this[key]
  } catch (_: Exception) {
    null
  }
}
