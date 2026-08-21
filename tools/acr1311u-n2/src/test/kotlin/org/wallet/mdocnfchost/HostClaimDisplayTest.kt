package org.wallet.mdocnfchost

import kotlin.test.Test
import kotlin.test.assertTrue

class HostClaimDisplayTest {
  @Test
  fun omitsRequestedIdentifierMissingFromClaims() {
    val omitted = HostClaimDisplay.omittedFields(
      requested = MDL_REQUEST_FIELDS,
      claims = mapOf("given_name" to "สมชาย", "family_name" to "ใจดี"),
    )
    assertTrue(omitted.any { it.key == "expiry_date" && it.reason == "holder_declined" })
    assertTrue(omitted.any { it.key == "birth_date" && it.reason == "holder_declined" })
    assertTrue(omitted.none { it.key == "age_over_18" })
  }

  @Test
  fun doesNotOmitSentBirthDateWhenFamilyNameWasDeclined() {
    val omitted = HostClaimDisplay.omittedFields(
      requested = MDL_REQUEST_FIELDS,
      claims = mapOf(
        "given_name" to "สมชาย",
        "birth_date" to "1990-05-15",
        "age_over_18" to "ใช่",
      ),
    )
    assertTrue(omitted.any { it.key == "family_name" && it.reason == "holder_declined" })
    assertTrue(omitted.none { it.key == "birth_date" })
  }

  @Test
  fun omitsTopLevelDatesWhenOnlyDrivingPrivilegesWasSent() {
    val omitted = HostClaimDisplay.omittedFields(
      requested = MDL_REQUEST_FIELDS,
      claims = mapOf(
        "given_name" to "A",
        "family_name" to "B",
        "birth_date" to "1990-01-01",
        "age_over_18" to "ใช่",
        "driving_privileges" to "รถยนต์ส่วนบุคคล",
      ),
    )
    assertTrue(omitted.any { it.key == "issue_date" && it.reason == "holder_declined" })
    assertTrue(omitted.any { it.key == "expiry_date" && it.reason == "holder_declined" })
    assertTrue(omitted.none { it.key == "driving_privileges" })
  }
}
