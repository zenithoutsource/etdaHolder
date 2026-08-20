package com.etdawallet.mdocproximity

import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborMap
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.toDataItem

/**
 * Session-only ISO mDL given_name/family_name overlay for lab NFC presentment.
 * Does not persist. issuerAuth is left unchanged, so MSO valueDigests no longer
 * match overlaid items. The ACR1311 lab extractor does not verify issuerAuth.
 */
object MdocDisplayNameOverlay {
  private val overlayIdentifiers = setOf("given_name", "family_name")

  fun apply(issuerSignedBytes: ByteArray, overlay: Map<String, String>): ByteArray {
    val replacements = overlay.filter { (key, value) ->
      overlayIdentifiers.contains(key) && value.isNotBlank()
    }
    if (replacements.isEmpty()) return issuerSignedBytes

    return try {
      val root = Cbor.decode(issuerSignedBytes)
      if (root !is CborMap) return issuerSignedBytes
      val nameSpaces = root.optional("nameSpaces") ?: return issuerSignedBytes
      val overlaidNameSpaces = overlayNameSpaces(nameSpaces, replacements) ?: return issuerSignedBytes
      Cbor.encode(
        buildCborMap {
          root.items.forEach { (key, value) ->
            val label = (key as? Tstr)?.value ?: return@forEach
            if (label == "nameSpaces") {
              put("nameSpaces", overlaidNameSpaces)
            } else {
              put(label, value)
            }
          }
        },
      )
    } catch (_: Exception) {
      issuerSignedBytes
    }
  }

  private fun overlayNameSpaces(nameSpaces: DataItem, overlay: Map<String, String>): DataItem? {
    val nsMap = try {
      nameSpaces.asMap
    } catch (_: Exception) {
      return null
    }

    return buildCborMap {
      var wroteIso = false
      nsMap.forEach { (nsKey, nsValue) ->
        val nsName = (nsKey as? Tstr)?.value ?: return@forEach
        if (nsName == MdocIssuerSignedExtractor.MDL_NAMESPACE) {
          wroteIso = true
          put(nsName, overlayIsoItems(nsValue, overlay))
        } else {
          put(nsName, nsValue)
        }
      }
      if (!wroteIso) {
        put(MdocIssuerSignedExtractor.MDL_NAMESPACE, overlayIsoItems(buildCborArray {}, overlay))
      }
    }
  }

  private fun overlayIsoItems(itemsValue: DataItem, overlay: Map<String, String>): DataItem {
    val items = try {
      itemsValue.asArray
    } catch (_: Exception) {
      emptyList()
    }

    val rebuilt = mutableListOf<DataItem>()
    val seen = mutableSetOf<String>()
    var maxDigestId = -1L

    for (item in items) {
      val parsed = readIssuerSignedItem(item)
      if (parsed == null) {
        rebuilt.add(item)
        continue
      }
      val (map, wrap) = parsed
      val identifier = readIdentifier(map)
      val digestId = readDigestId(map)
      if (digestId > maxDigestId) maxDigestId = digestId
      if (identifier != null && overlay.containsKey(identifier)) {
        seen.add(identifier)
        rebuilt.add(wrap(replaceElementValue(map, overlay.getValue(identifier))))
      } else {
        if (identifier != null) seen.add(identifier)
        rebuilt.add(item)
      }
    }

    for ((identifier, value) in overlay) {
      if (seen.contains(identifier)) continue
      maxDigestId += 1
      rebuilt.add(wrapEncoded(newIssuerSignedItem(maxDigestId, identifier, value)))
    }

    return buildCborArray {
      rebuilt.forEach { add(it) }
    }
  }

  private fun readIssuerSignedItem(item: DataItem): Pair<CborMap, (CborMap) -> DataItem>? {
    if (item is Tagged && item.tagNumber == Tagged.ENCODED_CBOR) {
      val inner = item.taggedItem
      val map = decodeToMap(inner) ?: return null
      return map to { updated -> Tagged(Tagged.ENCODED_CBOR, Bstr(Cbor.encode(updated))) }
    }
    if (item is Bstr) {
      val map = decodeToMap(item) ?: return null
      return map to { updated -> Bstr(Cbor.encode(updated)) }
    }
    if (item is CborMap) {
      return item to { updated -> updated }
    }
    return null
  }

  private fun decodeToMap(item: DataItem): CborMap? {
    val decoded = when (item) {
      is Bstr -> try {
        Cbor.decode(item.value)
      } catch (_: Exception) {
        return null
      }
      else -> item
    }
    return decoded as? CborMap
  }

  private fun replaceElementValue(map: CborMap, value: String): CborMap {
    return buildCborMap {
      map.items.forEach { (key, existing) ->
        val label = (key as? Tstr)?.value ?: return@forEach
        if (label == "elementValue") {
          put("elementValue", value)
        } else {
          put(label, existing)
        }
      }
    }
  }

  private fun newIssuerSignedItem(digestId: Long, identifier: String, value: String): CborMap {
    return buildCborMap {
      put("digestID", digestId.toDataItem())
      put("random", byteArrayOf(digestId.toByte(), 0x51, 0x44, 0x01, 0x02, 0x03, 0x04, 0x05))
      put("elementIdentifier", identifier)
      put("elementValue", value)
    }
  }

  private fun wrapEncoded(map: CborMap): DataItem =
    Tagged(Tagged.ENCODED_CBOR, Bstr(Cbor.encode(map)))

  private fun readIdentifier(map: CborMap): String? = try {
    map["elementIdentifier"].asTstr
  } catch (_: Exception) {
    null
  }

  private fun readDigestId(map: CborMap): Long = try {
    map["digestID"].asNumber
  } catch (_: Exception) {
    -1L
  }

  private fun DataItem.optional(key: String): DataItem? = try {
    this[key]
  } catch (_: Exception) {
    null
  }
}
