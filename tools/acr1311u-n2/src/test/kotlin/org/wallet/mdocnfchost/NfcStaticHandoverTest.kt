package org.wallet.mdocnfchost

import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NfcStaticHandoverTest {
  @Test
  fun roundTripDeviceEngagement() {
    val engagement = byteArrayOf(0xA1.toByte(), 0x00, 0x01, 0x02, 0x03)
    val ndef = NfcStaticHandover.encode(engagement)
    assertTrue(ndef.size > engagement.size)
    assertTrue(NfcStaticHandover.decode(ndef).contentEquals(engagement))
  }

  @Test
  fun rejectEmptyNdef() {
    assertFailsWith<IllegalArgumentException> {
      NfcStaticHandover.decode(byteArrayOf())
    }
  }
}
