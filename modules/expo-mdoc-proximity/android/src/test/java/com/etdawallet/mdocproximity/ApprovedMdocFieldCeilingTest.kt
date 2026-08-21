package com.etdawallet.mdocproximity

import org.junit.Assert.assertEquals
import org.junit.Test

class ApprovedMdocFieldCeilingTest {
  private val ns = "org.iso.18013.5.1"
  private val ceiling = listOf(
    "$ns.family_name",
    "$ns.given_name",
    "$ns.birth_date",
    "$ns.driving_privileges",
    "$ns.issue_date",
    "$ns.expiry_date",
  )
  private val requested = ceiling
  private val approvedWithoutExpiry = ceiling.filter { !it.endsWith("expiry_date") }

  @Test
  fun extraCountIsZeroWhenRequestStaysInsideCeilingEvenIfHolderTurnedAFieldOff() {
    assertEquals(0, ApprovedMdocFieldCeiling.extraIdentifierCount(ceiling, requested))
  }

  @Test
  fun extraCountFlagsIdentifiersOutsideTheProfileCeiling() {
    assertEquals(
      1,
      ApprovedMdocFieldCeiling.extraIdentifierCount(ceiling, requested + "$ns.portrait"),
    )
  }

  @Test
  fun holderDeclinedOmittedWhenRequestedInCeilingButNotSelected() {
    val (disclosed, omitted) = ApprovedMdocFieldCeiling.disclosedAndOmitted(
      requestedKeys = requested,
      approved = approvedWithoutExpiry,
      ceiling = ceiling,
    )
    assertEquals(approvedWithoutExpiry, disclosed)
    assertEquals(1, omitted.size)
    assertEquals("$ns.expiry_date", omitted[0].key)
    assertEquals(ApprovedMdocFieldCeiling.REASON_HOLDER_DECLINED, omitted[0].reason)
  }

  @Test
  fun disclosedKeysAreRequestIntersectApproved() {
    val (disclosed, omitted) = ApprovedMdocFieldCeiling.disclosedAndOmitted(
      requestedKeys = listOf("$ns.given_name", "$ns.expiry_date"),
      approved = approvedWithoutExpiry,
      ceiling = ceiling,
    )
    assertEquals(listOf("$ns.given_name"), disclosed)
    assertEquals("$ns.expiry_date", omitted.single().key)
  }
}
