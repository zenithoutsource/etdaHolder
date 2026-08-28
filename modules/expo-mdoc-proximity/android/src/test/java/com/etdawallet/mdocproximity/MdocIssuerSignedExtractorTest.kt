package com.etdawallet.mdocproximity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborArray
import org.multipaz.cbor.RawCbor
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.addCborMap
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.putCborArray
import org.multipaz.cbor.putCborMap
import org.multipaz.cbor.toDataItem
import org.multipaz.cose.Cose
import org.multipaz.cose.CoseNumberLabel
import org.multipaz.cose.CoseSign1
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
class MdocIssuerSignedExtractorTest {
  @Test
  fun extractsDocumentWithTopLevelDocType() {
    val issuerSigned = issuerSignedRoot()
    val document = Cbor.encode(
      buildCborMap {
        put("docType", MdocIssuerSignedExtractor.MDL_DOCTYPE)
        put("issuerSigned", RawCbor(issuerSigned))
      },
    )

    val (docType, extracted) = MdocIssuerSignedExtractor.extract(document)
    assertEquals(MdocIssuerSignedExtractor.MDL_DOCTYPE, docType)
    assertEquals(Cbor.decode(issuerSigned), Cbor.decode(extracted))
  }

  @Test
  fun unwrapsDeviceResponseDocuments() {
    val issuerSigned = issuerSignedRoot()
    val deviceResponse = Cbor.encode(
      buildCborMap {
        put("version", "1.0")
        put(
          "documents",
          buildCborArray {
            add(
              buildCborMap {
                put("docType", MdocIssuerSignedExtractor.MDL_DOCTYPE)
                put("issuerSigned", RawCbor(issuerSigned))
              },
            )
          },
        )
      },
    )

    val (docType, extracted) = MdocIssuerSignedExtractor.extract(deviceResponse)
    assertEquals(MdocIssuerSignedExtractor.MDL_DOCTYPE, docType)
    assertEquals(Cbor.decode(issuerSigned), Cbor.decode(extracted))
  }

  @Test
  fun extractsIssuerSignedAsRootWithoutDocType() {
    val issuerSigned = issuerSignedRoot()
    val (docType, extracted) = MdocIssuerSignedExtractor.extract(issuerSigned)
    assertEquals(MdocIssuerSignedExtractor.MDL_DOCTYPE, docType)
    assertEquals(Cbor.decode(issuerSigned), Cbor.decode(extracted))
  }

  @Test
  fun unwrapsCoseSign1Tag18() {
    val cose = coseSign1Array(Bstr(byteArrayOf(0xa0.toByte())))
    val issuerSigned = Cbor.encode(
      buildCborMap {
        put(
          "nameSpaces",
          buildCborMap {
            put(MdocIssuerSignedExtractor.MDL_NAMESPACE, buildCborArray {})
          },
        )
        put("issuerAuth", Tagged(Tagged.COSE_SIGN1, cose))
      },
    )

    val (_, extracted) = MdocIssuerSignedExtractor.extract(issuerSigned)
    val auth = Cbor.decode(extracted)["issuerAuth"]
    assertTrue(auth is CborArray)
    assertEquals(4, auth.asArray.size)
    CoseSign1.fromDataItem(auth)
  }

  @Test
  fun unwrapsBstrEncodedCoseSign1() {
    val cose = coseSign1Array(Bstr(byteArrayOf(0xa0.toByte())))
    val issuerSigned = Cbor.encode(
      buildCborMap {
        put(
          "nameSpaces",
          buildCborMap {
            put(MdocIssuerSignedExtractor.MDL_NAMESPACE, buildCborArray {})
          },
        )
        put("issuerAuth", Cbor.encode(cose))
      },
    )

    val (_, extracted) = MdocIssuerSignedExtractor.extract(issuerSigned)
    val auth = Cbor.decode(extracted)["issuerAuth"]
    assertTrue(auth is CborArray)
    CoseSign1.fromDataItem(auth)
  }

  @Test
  fun extractForPresentationPreservesTaggedIssuerAuthAndX5Chain() {
    val issuerAuth = buildCborArray {
      add(byteArrayOf())
      add(
        buildCborMap {
          put(
            33L,
            buildCborArray {
              add(Bstr(byteArrayOf(0x30, 0x01, 0x02)))
            },
          )
        },
      )
      add(Bstr(byteArrayOf(0xa0.toByte())))
      add(byteArrayOf(0x01))
    }
    val issuerSigned = Cbor.encode(
      buildCborMap {
        put(
          "nameSpaces",
          buildCborMap {
            put(MdocIssuerSignedExtractor.MDL_NAMESPACE, buildCborArray {})
          },
        )
        put("issuerAuth", Tagged(Tagged.COSE_SIGN1, issuerAuth))
      },
    )
    val document = Cbor.encode(
      buildCborMap {
        put("docType", MdocIssuerSignedExtractor.MDL_DOCTYPE)
        put("issuerSigned", RawCbor(issuerSigned))
      },
    )

    val (_, extracted) = MdocIssuerSignedExtractor.extractForPresentation(document)
    assertTrue(MdocIssuerAuthX5Chain.hasX5Chain(extracted))
    val auth = Cbor.decode(extracted)["issuerAuth"]
    val taggedAuth = auth as Tagged
    assertTrue(taggedAuth.tagNumber == Tagged.COSE_SIGN1)
  }

  @Test
  fun certifyProbeRejectsEmptyMsoMap() {
    val issuerSigned = Cbor.encode(
      buildCborMap {
        put(
          "nameSpaces",
          buildCborMap {
            put(MdocIssuerSignedExtractor.MDL_NAMESPACE, buildCborArray {})
          },
        )
        put("issuerAuth", Tagged(Tagged.COSE_SIGN1, coseSign1Array(Bstr(Cbor.encode(buildCborMap {})))))
      },
    )
    val (_, extracted) = MdocIssuerSignedExtractor.extract(issuerSigned)
    val error = assertThrows(IllegalArgumentException::class.java) {
      MdocIssuerAuthCertifySupport.requireCertifiable(extracted)
    }
    assertTrue(error.message!!.contains("MSO could not be parsed"))
  }

  @Test
  fun readValidityAcceptsEpochTaggedDates() {
    val bytes = issuerSignedWithMso(msoWithEpochDates())
    val (validFrom, validUntil) = MdocIssuerAuthCertifySupport.readValidity(bytes)
    assertEquals(1_700_000_000L, validFrom.epochSeconds)
    assertEquals(2_000_000_000L, validUntil.epochSeconds)
    val error = assertThrows(IllegalArgumentException::class.java) {
      MdocIssuerAuthCertifySupport.requireCertifiable(bytes)
    }
    assertTrue(error.message!!.contains("validFrom=tag1"))
  }

  @Test
  fun readValidityAcceptsRfc3339Dates() {
    val mso = buildCborMap {
      putCborMap("validityInfo") {
        put("validFrom", Tagged(Tagged.DATE_TIME_STRING, Tstr("2024-01-01T00:00:00Z")))
        put("validUntil", Tagged(Tagged.DATE_TIME_STRING, Tstr("2034-01-01T00:00:00Z")))
      }
    }
    val (validFrom, validUntil) = MdocIssuerAuthCertifySupport.readValidity(issuerSignedWithMso(mso))
    assertEquals("2024-01-01T00:00:00Z", validFrom.toString())
    assertEquals("2034-01-01T00:00:00Z", validUntil.toString())
  }

  @Test
  fun usesStoredDocTypeWhenCborHasNone() {
    val issuerSigned = Cbor.encode(
      buildCborMap {
        put(
          "nameSpaces",
          buildCborMap {
            put("th.go.example.ns", buildCborArray {})
          },
        )
      },
    )

    val (docType, extracted) = MdocIssuerSignedExtractor.extract(
      issuerSigned,
      storedDocType = "th.go.example.doc",
    )
    assertEquals("th.go.example.doc", docType)
    assertTrue(Cbor.decode(extracted).asMap.isNotEmpty())
  }

  private fun issuerSignedRoot(): ByteArray = Cbor.encode(
    buildCborMap {
      put(
        "nameSpaces",
        buildCborMap {
          put(MdocIssuerSignedExtractor.MDL_NAMESPACE, buildCborArray {})
        },
      )
      put("issuerAuth", byteArrayOf(0xd2.toByte()))
    },
  )

  private fun coseSign1Array(payload: Bstr) = buildCborArray {
    add(byteArrayOf())
    addCborMap {}
    add(payload)
    add(byteArrayOf(0x00))
  }

  private fun issuerSignedWithMso(mso: org.multipaz.cbor.DataItem): ByteArray {
    val payload = Cbor.encode(Tagged(Tagged.ENCODED_CBOR, Bstr(Cbor.encode(mso))))
    return Cbor.encode(
      buildCborMap {
        put(
          "nameSpaces",
          buildCborMap {
            put(MdocIssuerSignedExtractor.MDL_NAMESPACE, buildCborArray {})
          },
        )
        put("issuerAuth", coseSign1Array(Bstr(payload)))
      },
    )
  }

  private fun msoWithEpochDates() = buildCborMap {
    put("version", "1.0")
    put("digestAlgorithm", "SHA-256")
    put("docType", MdocIssuerSignedExtractor.MDL_DOCTYPE)
    putCborMap("valueDigests") {
      putCborMap(MdocIssuerSignedExtractor.MDL_NAMESPACE) {
        put(0L, byteArrayOf(1))
      }
    }
    putCborMap("deviceKeyInfo") {
      putCborMap("deviceKey") {
        put(1L, 2L)
        put(-1L, 1L)
        put(-2L, ByteArray(32))
        put(-3L, ByteArray(32))
      }
    }
    putCborMap("validityInfo") {
      put("signed", Tagged(Tagged.DATE_TIME_NUMBER, 1_700_000_000L.toDataItem()))
      put("validFrom", Tagged(Tagged.DATE_TIME_NUMBER, 1_700_000_000L.toDataItem()))
      put("validUntil", Tagged(Tagged.DATE_TIME_NUMBER, 2_000_000_000L.toDataItem()))
    }
  }
}
