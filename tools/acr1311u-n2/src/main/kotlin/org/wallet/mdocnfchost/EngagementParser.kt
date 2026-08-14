package org.wallet.mdocnfchost

import java.util.Base64

object EngagementParser {
  fun parseEngagementUri(input: String): ByteArray {
    val trimmed = input.trim()
    if (trimmed.isEmpty()) {
      throw IllegalArgumentException("Engagement QR is empty")
    }
    val payload = when {
      trimmed.startsWith("mdoc://") -> trimmed.removePrefix("mdoc://")
      trimmed.startsWith("mdoc:") -> trimmed.removePrefix("mdoc:")
      else -> trimmed
    }
    if (payload.isEmpty()) {
      throw IllegalArgumentException("Engagement QR is missing mdoc payload")
    }
    return decodeBase64Url(payload)
  }

  fun decodeBase64Url(value: String): ByteArray {
    val normalized = value.replace('-', '+').replace('_', '/')
    val padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
    return try {
      Base64.getDecoder().decode(padded)
    } catch (error: IllegalArgumentException) {
      throw IllegalArgumentException("Engagement QR is not valid base64url", error)
    }
  }
}
