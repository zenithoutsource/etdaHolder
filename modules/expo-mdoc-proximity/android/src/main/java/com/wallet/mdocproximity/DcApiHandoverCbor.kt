package com.wallet.mdocproximity

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.buildCborArray
import java.security.MessageDigest
import java.util.TreeMap

object DcApiHandoverCbor {
  private const val HANDOVER_LABEL = "OpenID4VPDCAPIHandover"

  fun buildHandover(
    origin: String,
    nonce: String,
    jwkThumbprint: ByteArray?,
  ): ByteArray {
    val infoBytes = Cbor.encode(
      buildCborArray {
        add(origin)
        add(nonce)
        add(jwkThumbprint?.let(::Bstr) ?: Simple.NULL)
      },
    )
    return Cbor.encode(
      buildCborArray {
        add(HANDOVER_LABEL)
        add(Bstr(MessageDigest.getInstance("SHA-256").digest(infoBytes)))
      },
    )
  }

  fun sha256ThumbprintOfJwk(jwkJson: String): ByteArray? = runCatching {
    val jwk = Json.parseToJsonElement(jwkJson) as JsonObject
    val requiredMembers = requiredThumbprintMembers(jwk)
    val canonicalJwk = Json.encodeToString(
      JsonObject(TreeMap(requiredMembers.mapValues { JsonPrimitive(it.value) })),
    )
    MessageDigest.getInstance("SHA-256").digest(canonicalJwk.encodeToByteArray())
  }.getOrNull()

  private fun requiredThumbprintMembers(jwk: JsonObject): Map<String, String> {
    val keyType = requiredString(jwk, "kty")
    val names = when (keyType) {
      "EC" -> listOf("crv", "kty", "x", "y")
      "OKP" -> listOf("crv", "kty", "x")
      "RSA" -> listOf("e", "kty", "n")
      "oct" -> listOf("k", "kty")
      else -> throw IllegalArgumentException("Unsupported JWK key type")
    }
    return names.associateWith { requiredString(jwk, it) }
  }

  private fun requiredString(jwk: JsonObject, name: String): String =
    jwk[name]?.jsonPrimitive?.content?.takeIf { it.isNotEmpty() }
      ?: throw IllegalArgumentException("JWK member $name is required")
}
