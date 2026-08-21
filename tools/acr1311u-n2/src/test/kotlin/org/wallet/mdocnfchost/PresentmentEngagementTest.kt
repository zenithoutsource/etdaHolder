package org.wallet.mdocnfchost

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PresentmentEngagementTest {
  @Test
  fun tapOnlyWhenEngagementOmitted() {
    assertTrue(PresentmentEngagement.isTapOnly(null))
    assertTrue(PresentmentEngagement.isTapOnly("  "))
    assertFalse(PresentmentEngagement.isTapOnly("mdoc:abc"))
  }
}
