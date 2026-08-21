package com.etdawallet.mdocproximity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborMap
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.toDataItem

class MdocDisplayNameOverlayTest {
  @Test
  fun replacesExistingIsoNameItemsAndKeepsIssuerAuth() {
    val original = issuerSigned(
      taggedItem(0, "given_name", "Ada"),
      taggedItem(1, "family_name", "Lovelace"),
      taggedItem(2, "expiry_date", "2030-01-31"),
    )

    val overlaid = MdocDisplayNameOverlay.apply(
      original,
      mapOf(
        "given_name" to "นางสาว พิชญา",
        "family_name" to "รุ่งเรืองกิจ",
      ),
    )

    val names = readIsoNames(overlaid)
    assertEquals("นางสาว พิชญา", names["given_name"])
    assertEquals("รุ่งเรืองกิจ", names["family_name"])
    assertEquals("2030-01-31", names["expiry_date"])
    assertEquals(Cbor.decode(original)["issuerAuth"], Cbor.decode(overlaid)["issuerAuth"])
  }

  @Test
  fun addsMissingIsoNameItems() {
    val original = issuerSigned(taggedItem(0, "expiry_date", "2030-01-31"))

    val overlaid = MdocDisplayNameOverlay.apply(
      original,
      mapOf(
        "given_name" to "พิชญา",
        "family_name" to "รุ่งเรืองกิจ",
      ),
    )

    val names = readIsoNames(overlaid)
    assertEquals("พิชญา", names["given_name"])
    assertEquals("รุ่งเรืองกิจ", names["family_name"])
    assertEquals("2030-01-31", names["expiry_date"])
  }

  @Test
  fun leavesBytesUnchangedWhenOverlayIsEmpty() {
    val original = issuerSigned(taggedItem(0, "given_name", "Ada"))
    val overlaid = MdocDisplayNameOverlay.apply(original, emptyMap())
    assertEquals(original.toList(), overlaid.toList())
  }

  @Test
  fun doesNotCopyBirthDateOrOtherKeys() {
    val original = issuerSigned(taggedItem(0, "given_name", "Ada"))
    val overlaid = MdocDisplayNameOverlay.apply(
      original,
      mapOf(
        "given_name" to "พิชญา",
        "birth_date" to "1990-05-15",
      ),
    )
    val names = readIsoNames(overlaid)
    assertEquals("พิชญา", names["given_name"])
    assertEquals(null, names["birth_date"])
    assertNotEquals("1990-05-15", names["given_name"])
  }

  private fun taggedItem(digestId: Long, identifier: String, value: String): DataItem {
    val encoded = Cbor.encode(
      buildCborMap {
        put("digestID", digestId.toDataItem())
        put("random", byteArrayOf(digestId.toByte()))
        put("elementIdentifier", identifier)
        put("elementValue", value)
      },
    )
    return Tagged(Tagged.ENCODED_CBOR, Bstr(encoded))
  }

  private fun issuerSigned(vararg items: DataItem): ByteArray = Cbor.encode(
    buildCborMap {
      put(
        "nameSpaces",
        buildCborMap {
          put(
            MdocIssuerSignedExtractor.MDL_NAMESPACE,
            buildCborArray {
              items.forEach { add(it) }
            },
          )
        },
      )
      put("issuerAuth", byteArrayOf(0xd2.toByte()))
    },
  )

  private fun readIsoNames(bytes: ByteArray): Map<String, String> {
    val items = Cbor.decode(bytes)["nameSpaces"][MdocIssuerSignedExtractor.MDL_NAMESPACE].asArray
    val names = linkedMapOf<String, String>()
    for (item in items) {
      val map = unwrapItem(item) ?: continue
      val identifier = try {
        map["elementIdentifier"].asTstr
      } catch (_: Exception) {
        continue
      }
      val value = try {
        map["elementValue"].asTstr
      } catch (_: Exception) {
        continue
      }
      names[identifier] = value
    }
    return names
  }

  private fun unwrapItem(item: DataItem): CborMap? {
    val tagged = if (item is Tagged && item.tagNumber == Tagged.ENCODED_CBOR) item.taggedItem else item
    val decoded = if (tagged is Bstr) Cbor.decode(tagged.value) else tagged
    return decoded as? CborMap
  }
}
