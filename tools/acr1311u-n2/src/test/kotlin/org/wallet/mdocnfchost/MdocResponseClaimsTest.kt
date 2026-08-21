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
import kotlin.test.assertTrue

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
    assertEquals(TestMdlGenerator.DEFAULT_BIRTH_DATE, claims["birth_date"])
    assertEquals("รถยนต์ส่วนบุคคล", claims["driving_privileges"])
    assertEquals("2024-01-01", claims["issue_date"])
    assertEquals("2034-01-01", claims["expiry_date"])
  }

  @Test
  fun doesNotMarkSentBirthDateAsOmittedWhenDerivingAgeOver18() = runBlocking {
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
    val omitted = HostClaimDisplay.omittedFields(MDL_REQUEST_FIELDS, claims)

    assertEquals(TestMdlGenerator.DEFAULT_BIRTH_DATE, claims["birth_date"])
    assertTrue(claims["age_over_18"] == "ใช่" || claims["age_over_18"] == "ไม่")
    assertTrue(omitted.none { it.key == "birth_date" })
  }

  @Test
  fun doesNotPromotePrivilegeNestedDatesOntoTopLevelIssueOrExpiry() = runBlocking {
    val deviceKey = Crypto.createEcPrivateKey(EcCurve.P256)
    val generated = TestMdlGenerator.generate(
      deviceKey.publicKey,
      includeTopLevelLicenceDates = false,
    )
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
    val omitted = HostClaimDisplay.omittedFields(MDL_REQUEST_FIELDS, claims)

    assertEquals("รถยนต์ส่วนบุคคล", claims["driving_privileges"])
    assertTrue(claims["issue_date"].isNullOrBlank())
    assertTrue(claims["expiry_date"].isNullOrBlank())
    assertTrue(omitted.any { it.key == "issue_date" && it.reason == "holder_declined" })
    assertTrue(omitted.any { it.key == "expiry_date" && it.reason == "holder_declined" })
  }
}
