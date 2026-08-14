package org.wallet.mdocnfchost

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class EngagementParserTest {
  @Test
  fun parseMdocPrefix() {
    val payload = byteArrayOf(1, 2, 3, 4)
    val encoded = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(payload)
    val decoded = EngagementParser.parseEngagementUri("mdoc:$encoded")
    assertTrue(decoded.contentEquals(payload))
  }

  @Test
  fun parseMdocSlashPrefix() {
    val payload = byteArrayOf(9, 8, 7)
    val encoded = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(payload)
    val decoded = EngagementParser.parseEngagementUri("mdoc://$encoded")
    assertTrue(decoded.contentEquals(payload))
  }

  @Test
  fun rejectGarbage() {
    assertFailsWith<IllegalArgumentException> {
      EngagementParser.parseEngagementUri("mdoc:%%%not-base64%%%")
    }
  }

  @Test
  fun rejectEmpty() {
    assertFailsWith<IllegalArgumentException> {
      EngagementParser.parseEngagementUri("   ")
    }
  }
}

class StatusWordMapperTest {
  @Test
  fun mapsUnarmedAndDenied() {
    assertTrue(StatusWordMapper.messageForStatus(0x6A82).contains("not armed"))
    assertTrue(StatusWordMapper.messageForStatus(0x6985).contains("not approved"))
    assertEquals("6A82", StatusWordMapper.codeForStatus(0x6A82))
    assertEquals("6985", StatusWordMapper.codeForStatus(0x6985))
  }

  @Test
  fun unwrapsFailedWhileOpeningTransportToUnarmedSelect() {
    val wrapped = Exception(
      "Failed while opening transport",
      org.multipaz.nfc.NfcCommandFailedException("Error selecting application, status 6a82", 0x6A82),
    )
    val mapped = StatusWordMapper.fromTransportOpenFailure(wrapped)
    assertEquals("6A82", mapped.code)
    assertTrue(mapped.message.contains("not armed"))
  }

  @Test
  fun unwrapsJavaErrorCauseToUnarmedSelect() {
    val wrapped = java.lang.Error(
      "Failed while opening transport",
      org.multipaz.nfc.NfcCommandFailedException("Error selecting application, status 6a82", 0x6A82),
    )
    val mapped = StatusWordMapper.fromTransportOpenFailure(wrapped)
    assertEquals("6A82", mapped.code)
    assertTrue(mapped.message.contains("not armed"))
  }

  @Test
  fun unwrapsFailedWhileOpeningTransportToNotApproved() {
    val wrapped = Exception(
      "Failed while opening transport",
      org.multipaz.nfc.NfcCommandFailedException("Error selecting application, status 6985", 0x6985),
    )
    val mapped = StatusWordMapper.fromTransportOpenFailure(wrapped)
    assertEquals("6985", mapped.code)
    assertTrue(mapped.message.contains("not approved"))
  }
}
