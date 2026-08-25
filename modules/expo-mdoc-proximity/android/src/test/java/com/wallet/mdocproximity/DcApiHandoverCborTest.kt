package com.wallet.mdocproximity

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborArray
import java.security.MessageDigest

class DcApiHandoverCborTest {
  @Test
  fun buildsUnsignedHandoverWithLabelAndHashOfNullThumbprintInfo() {
    val handover = Cbor.decode(
      DcApiHandoverCbor.buildHandover(
        origin = "https://example.com",
        nonce = "exc7gBkxjx1rdc9udRrveKvSsJIq80avlXeLHhGwqtA",
        jwkThumbprint = null,
      ),
    ) as CborArray

    assertEquals("OpenID4VPDCAPIHandover", handover.asArray[0].asTstr)
    assertTrue(handover.asArray[1] is Bstr)

    val independentlyEncodedInfo = hex(
      "837368747470733a2f2f6578616d706c652e636f6d782b" +
        "6578633767426b786a7831726463397564527276654b7653" +
        "734a4971383061766c58654c48684777717441f6",
    )
    val expectedDigest = MessageDigest.getInstance("SHA-256").digest(independentlyEncodedInfo)
    assertArrayEquals(expectedDigest, (handover.asArray[1] as Bstr).value)
  }

  @Test
  fun buildsAppendixAGoldenVectorWithByteStringJwkThumbprint() {
    val origin = "https://example.com"
    val nonce = "exc7gBkxjx1rdc9udRrveKvSsJIq80avlXeLHhGwqtA"
    val expectedThumbprint = hex("4283ec927ae0f208daaa2d026a814f2b22dca52cf85ffa8f3f8626c6bd669047")
    val expectedHandover = hex(
      "82764f70656e4944345650444341504948616e646f7665725820" +
        "fbece366f4212f9762c74cfdbf83b8c69e371d5d68cea09cb4c48ca6daab761a",
    )

    assertArrayEquals(
      expectedHandover,
      DcApiHandoverCbor.buildHandover(origin, nonce, expectedThumbprint),
    )
    assertNotEquals(
      Cbor.decode(expectedHandover),
      Cbor.decode(DcApiHandoverCbor.buildHandover(origin, nonce, null)),
    )
  }

  @Test
  fun derivesRfc7638EcThumbprintDeterministicallyFromRequiredMembersOnly() {
    val expected = hex("4283ec927ae0f208daaa2d026a814f2b22dca52cf85ffa8f3f8626c6bd669047")
    val standardOrder = """
      {"kty":"EC","crv":"P-256","x":"DxiH5Q4Yx3UrukE2lWCErq8N8bqC9CHLLrAwLz5BmE0","y":"XtLM4-3h5o3HUH0MHVJV0kyq0iBlrBwlh8qEDMZ4-Pc","use":"enc","alg":"ECDH-ES","kid":"1"}
    """.trimIndent()
    val reorderedWithDifferentOptionalValues = """
      {"kid":"other","y":"XtLM4-3h5o3HUH0MHVJV0kyq0iBlrBwlh8qEDMZ4-Pc","alg":"unused","x":"DxiH5Q4Yx3UrukE2lWCErq8N8bqC9CHLLrAwLz5BmE0","kty":"EC","use":"sig","crv":"P-256"}
    """.trimIndent()

    assertArrayEquals(expected, DcApiHandoverCbor.sha256ThumbprintOfJwk(standardOrder))
    assertArrayEquals(expected, DcApiHandoverCbor.sha256ThumbprintOfJwk(reorderedWithDifferentOptionalValues))
  }

  private fun hex(value: String): ByteArray = value
    .chunked(2)
    .map { it.toInt(16).toByte() }
    .toByteArray()
}
