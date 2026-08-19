package org.wallet.mdocnfchost

import kotlinx.coroutines.runBlocking
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.RawCbor
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import kotlin.test.Test
import kotlin.test.assertEquals

class MdocResponseClaimsTest {
  @Test
  fun extractsTopLevelIssueAndExpiryDates() = runBlocking {
    val deviceKey = Crypto.createEcPrivateKey(EcCurve.P256)
    val generated = TestMdlGenerator.generate(deviceKey.publicKey)
    val deviceResponse = Cbor.encode(
      buildCborMap {
        put("version", "1.0")
        put(
          "documents",
          buildCborArray {
            add(RawCbor(generated.mdocBytes))
          },
        )
      },
    )

    val claims = MdocResponseClaims.extract(deviceResponse).claims
    assertEquals("HOLDER", claims["given_name"])
    assertEquals("TEST", claims["family_name"])
    assertEquals("รถยนต์ส่วนบุคคล", claims["driving_privileges"])
    assertEquals("2024-01-01", claims["issue_date"])
    assertEquals("2034-01-01", claims["expiry_date"])
  }
}
