package com.wallet.mdocproximity

import com.etdawallet.mdocproximity.MdocIssuerAuthX5Chain
import com.etdawallet.mdocproximity.MdocIssuerSignedExtractor
import kotlinx.coroutines.runBlocking
import kotlinx.io.bytestring.ByteString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborArray
import org.multipaz.cbor.CborMap
import org.multipaz.cbor.Simple
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.addCborMap
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.putCborArray
import org.multipaz.cbor.putCborMap
import org.multipaz.cose.Cose
import org.multipaz.cose.CoseNumberLabel
import org.multipaz.crypto.EcCurve
import org.multipaz.crypto.EcPublicKeyDoubleCoordinate
import org.multipaz.mdoc.issuersigned.IssuerNamespaces
import org.multipaz.mdoc.issuersigned.IssuerSignedItem

class DcApiDeviceResponseBuilderTest {
  @Test
  fun buildsDeviceResponseWhoseDeviceAuthenticationUsesDcApiSessionTranscript() = runBlocking {
    var signedBytes: ByteArray? = null
    val origin = "https://example.com"
    val nonce = "exc7gBkxjx1rdc9udRrveKvSsJIq80avlXeLHhGwqtA"
    val encryptionJwk = """
      {"kty":"EC","crv":"P-256","x":"DxiH5Q4Yx3UrukE2lWCErq8N8bqC9CHLLrAwLz5BmE0","y":"XtLM4-3h5o3HUH0MHVJV0kyq0iBlrBwlh8qEDMZ4-Pc"}
    """.trimIndent()

    val encoded = DcApiDeviceResponseBuilder.build(
      mdocBytes = storedMdocBytes(),
      storedDocType = MdocIssuerSignedExtractor.MDL_DOCTYPE,
      approvedNamespaceKeys = listOf("${MdocIssuerSignedExtractor.MDL_NAMESPACE}/family_name"),
      origin = origin,
      nonce = nonce,
      encryptionJwkJson = encryptionJwk,
      publicKey = testPublicKey(),
      sign = { data ->
        signedBytes = data.copyOf()
        ByteArray(64) { index -> (index + 1).toByte() }
      },
    )

    val response = Cbor.decode(encoded) as CborMap
    assertEquals("1.0", response["version"].asTstr)
    assertEquals(0L, response["status"].asNumber)
    assertEquals(MdocIssuerSignedExtractor.MDL_DOCTYPE, response["documents"][0]["docType"].asTstr)

    val deviceAuthentication = readDeviceAuthentication(signedBytes!!)
    val sessionTranscript = deviceAuthentication.asArray[1] as CborArray
    assertEquals(Simple.NULL, sessionTranscript.asArray[0])
    assertEquals(Simple.NULL, sessionTranscript.asArray[1])
    assertEquals(
      Cbor.decode(
        DcApiHandoverCbor.buildHandover(
          origin,
          nonce,
          DcApiHandoverCbor.sha256ThumbprintOfJwk(encryptionJwk),
        ),
      ),
      sessionTranscript.asArray[2],
    )
  }

  @Test
  fun disclosesOnlyApprovedIssuerSignedNamespaceFields() = runBlocking {
    val encoded = DcApiDeviceResponseBuilder.build(
      mdocBytes = storedMdocBytes(),
      storedDocType = MdocIssuerSignedExtractor.MDL_DOCTYPE,
      approvedNamespaceKeys = listOf("${MdocIssuerSignedExtractor.MDL_NAMESPACE}/family_name"),
      origin = "https://example.com",
      nonce = "nonce-1",
      encryptionJwkJson = null,
      publicKey = testPublicKey(),
      sign = { ByteArray(64) { 0x5a } },
    )

    val response = Cbor.decode(encoded)
    val issuerNamespaces = IssuerNamespaces.fromDataItem(
      response["documents"][0]["issuerSigned"]["nameSpaces"],
    )

    assertEquals(setOf(MdocIssuerSignedExtractor.MDL_NAMESPACE), issuerNamespaces.data.keys)
    assertEquals(
      setOf("family_name"),
      issuerNamespaces.data.getValue(MdocIssuerSignedExtractor.MDL_NAMESPACE).keys,
    )
    assertTrue(issuerNamespaces.data[MdocIssuerSignedExtractor.MDL_NAMESPACE]?.containsKey("given_name") == false)
  }

  private fun readDeviceAuthentication(coseSignatureInput: ByteArray): CborArray {
    val signatureStructure = Cbor.decode(coseSignatureInput) as CborArray
    assertEquals("Signature1", signatureStructure.asArray[0].asTstr)
    val deviceAuthenticationBytes = (signatureStructure.asArray[3] as Bstr).value
    val encodedDeviceAuthentication = Cbor.decode(deviceAuthenticationBytes) as Tagged
    assertEquals(Tagged.ENCODED_CBOR, encodedDeviceAuthentication.tagNumber)
    return Cbor.decode((encodedDeviceAuthentication.taggedItem as Bstr).value) as CborArray
  }

  @Test
  fun preservesIssuerAuthX5ChainThroughPresentationPipeline() = runBlocking {
    val encoded = DcApiDeviceResponseBuilder.build(
      mdocBytes = storedMdocBytes(includeX5Chain = true),
      storedDocType = MdocIssuerSignedExtractor.MDL_DOCTYPE,
      approvedNamespaceKeys = listOf("${MdocIssuerSignedExtractor.MDL_NAMESPACE}/family_name"),
      origin = "https://example.com",
      nonce = "nonce-x5chain",
      encryptionJwkJson = null,
      publicKey = testPublicKey(),
      sign = { ByteArray(64) { 0x2b } },
    )

    val response = Cbor.decode(encoded) as CborMap
    val issuerSignedBytes = Cbor.encode(response["documents"][0]["issuerSigned"])
    assertTrue(MdocIssuerAuthX5Chain.hasX5Chain(issuerSignedBytes))
  }

  private fun storedMdocBytes(includeX5Chain: Boolean = true): ByteArray {
    val mdlItems = listOf(
      issuerSignedItem(0, "family_name", "Doe"),
      issuerSignedItem(1, "given_name", "Jane"),
    )
    val ageItems = listOf(issuerSignedItem(2, "age_over_21", true))
    val issuerAuth = buildCborArray {
      add(byteArrayOf())
      add(
        buildCborMap {
          if (includeX5Chain) {
            put(
              33L,
              buildCborArray {
                add(Bstr(byteArrayOf(0x30, 0x01, 0x02)))
              },
            )
          }
        },
      )
      add(Bstr(byteArrayOf(0xa0.toByte())))
      add(byteArrayOf(0x01))
    }
    return Cbor.encode(
      buildCborMap {
        put("docType", MdocIssuerSignedExtractor.MDL_DOCTYPE)
        putCborMap("issuerSigned") {
          putCborMap("nameSpaces") {
            putCborArray(MdocIssuerSignedExtractor.MDL_NAMESPACE) {
              mdlItems.forEach(::add)
            }
            putCborArray("org.iso.18013.5.1.aamva") {
              ageItems.forEach(::add)
            }
          }
          put("issuerAuth", issuerAuth)
        }
      },
    )
  }

  private fun issuerSignedItem(digestId: Long, identifier: String, value: Any): org.multipaz.cbor.DataItem {
    val dataItem = when (value) {
      is String -> org.multipaz.cbor.Tstr(value)
      is Boolean -> if (value) Simple.TRUE else Simple.FALSE
      else -> error("Unsupported fixture value")
    }
    val item = IssuerSignedItem.fromValues(
      digestId = digestId,
      random = ByteString(ByteArray(16) { digestId.toByte() }),
      dataElementIdentifier = identifier,
      dataElementValue = dataItem,
    ).dataItem
    return Tagged(Tagged.ENCODED_CBOR, Bstr(Cbor.encode(item)))
  }

  private fun testPublicKey() = EcPublicKeyDoubleCoordinate(
    curve = EcCurve.P256,
    x = hex("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
    y = hex("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"),
  )

  private fun hex(value: String): ByteArray = value
    .chunked(2)
    .map { it.toInt(16).toByte() }
    .toByteArray()
}
