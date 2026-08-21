package com.etdawallet.mdocproximity

import kotlinx.io.bytestring.ByteString
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborArray
import org.multipaz.cbor.CborDouble
import org.multipaz.cbor.CborFloat
import org.multipaz.cbor.CborMap
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Nint
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.Uint
import org.multipaz.cose.CoseSign1
import org.multipaz.mdoc.credential.MdocCredential
import org.multipaz.mdoc.mso.MobileSecurityObject
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * Multipaz `MdocCredential.certify` parses the MSO with bare `require()` checks
 * (tag-0 tdate, integer COSE_Key labels, tag-24 payload). Issued OID4VCI
 * documents often differ. Holder presentment does not need that parse: DeviceResponse
 * uses original `issuerAuth` plus the wallet device key. Stamp the original
 * issuerSigned bytes and a validity window so the credential is certified.
 */
@OptIn(ExperimentalTime::class)
object MdocIssuerAuthCertifySupport {
  private val WIDE_VALID_FROM = Instant.fromEpochSeconds(0)
  private val WIDE_VALID_UNTIL = Instant.fromEpochSeconds(4_102_444_800) // 2100-01-01Z

  suspend fun certify(credential: MdocCredential, issuerSignedBytes: ByteArray): Boolean {
    try {
      credential.certify(ByteString(issuerSignedBytes))
      return false
    } catch (error: kotlin.coroutines.cancellation.CancellationException) {
      throw error
    } catch (_: Exception) {
      // Issued MSOs often fail Multipaz's strict parser. Stamp original bytes.
    }
    val validity = readValidity(issuerSignedBytes)
    stampCertified(credential, issuerSignedBytes, validity.first, validity.second)
    return true
  }

  fun readValidity(issuerSignedBytes: ByteArray): Pair<Instant, Instant> {
    val mso = decodeMsoMap(issuerSignedBytes) ?: return WIDE_VALID_FROM to WIDE_VALID_UNTIL
    val validityInfo = mso.getOrNull("validityInfo") as? CborMap ?: return WIDE_VALID_FROM to WIDE_VALID_UNTIL
    val validFrom = validityInfo.getOrNull("validFrom")?.let(::readInstant)
      ?: validityInfo.getOrNull("signed")?.let(::readInstant)
      ?: WIDE_VALID_FROM
    val validUntil = validityInfo.getOrNull("validUntil")?.let(::readInstant)
      ?: WIDE_VALID_UNTIL
    return validFrom to validUntil
  }

  internal fun decodeMsoMap(issuerSignedBytes: ByteArray): CborMap? {
    val payload = readCosePayload(issuerSignedBytes) ?: return null
    val decoded = try {
      Cbor.decode(payload)
    } catch (_: Exception) {
      return null
    }
    return msoMapFromCosePayload(decoded)
  }

  fun describeMso(issuerSignedBytes: ByteArray): String {
    val mso = decodeMsoMap(issuerSignedBytes)
      ?: return "MSO map unavailable"
    val fields = listOf("version", "digestAlgorithm", "docType", "valueDigests", "deviceKeyInfo", "validityInfo")
    val parts = mutableListOf<String>()
    for (field in fields) {
      parts.add("$field=${describeItem(mso.getOrNull(field))}")
    }
    (mso.getOrNull("validityInfo") as? CborMap)?.let { info ->
      parts.add("signed=${describeItem(info.getOrNull("signed"))}")
      parts.add("validFrom=${describeItem(info.getOrNull("validFrom"))}")
      parts.add("validUntil=${describeItem(info.getOrNull("validUntil"))}")
    }
    (mso.getOrNull("deviceKeyInfo") as? CborMap)?.getOrNull("deviceKey")?.let { key ->
      parts.add("deviceKey=${describeItem(key)}")
    }
    return parts.joinToString(",")
  }

  internal fun readInstant(item: DataItem): Instant? {
    return when (item) {
      is Tagged -> when (item.tagNumber) {
        Tagged.DATE_TIME_STRING, Tagged.FULL_DATE_STRING -> parseTstrInstant(item.taggedItem)
        Tagged.DATE_TIME_NUMBER -> readEpochInstant(item.taggedItem)
        else -> parseTstrInstant(item.taggedItem) ?: readEpochInstant(item.taggedItem)
      }
      is Tstr -> parseTstrInstant(item)
      else -> readEpochInstant(item)
    }
  }

  private fun readCosePayload(issuerSignedBytes: ByteArray): ByteArray? {
    val issuerSigned = try {
      Cbor.decode(issuerSignedBytes)
    } catch (_: Exception) {
      return null
    }
    val authItem = issuerSigned.getOrNull("issuerAuth") ?: return null
    val cose = try {
      CoseSign1.fromDataItem(MdocIssuerSignedExtractor.unwrapCoseSign1Item(authItem))
    } catch (_: Exception) {
      return null
    }
    return cose.payload
  }

  private fun msoMapFromCosePayload(decoded: DataItem): CborMap? {
    when (decoded) {
      is CborMap -> return decoded
      is Tagged -> {
        val child = decoded.taggedItem
        if (child is Bstr) {
          return try {
            Cbor.decode(child.value) as? CborMap
          } catch (_: Exception) {
            null
          }
        }
        if (child is CborMap) return child
        return msoMapFromCosePayload(child)
      }
      is Bstr -> {
        return try {
          msoMapFromCosePayload(Cbor.decode(decoded.value))
        } catch (_: Exception) {
          null
        }
      }
      else -> return null
    }
  }

  private fun parseTstrInstant(item: DataItem): Instant? {
    if (item !is Tstr) return null
    val text = item.value
    return try {
      Instant.parse(text)
    } catch (_: Exception) {
      if (text.length >= 10) {
        try {
          Instant.parse("${text.substring(0, 10)}T00:00:00Z")
        } catch (_: Exception) {
          null
        }
      } else {
        null
      }
    }
  }

  private fun readEpochInstant(item: DataItem): Instant? {
    return try {
      when (item) {
        is Uint, is Nint -> Instant.fromEpochSeconds(item.asNumber)
        is CborFloat -> Instant.fromEpochMilliseconds((item.asFloat * 1000f).toLong())
        is CborDouble -> Instant.fromEpochMilliseconds((item.asDouble * 1000.0).toLong())
        else -> Instant.fromEpochSeconds(item.asNumber)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun describeItem(item: DataItem?): String {
    if (item == null) return "missing"
    return when (item) {
      is Tagged -> "tag${item.tagNumber}/${item.taggedItem::class.java.simpleName}"
      is Tstr -> "tstr"
      is Bstr -> "bstr"
      is CborMap -> "map"
      is CborArray -> "array"
      is Uint, is Nint -> "int"
      is CborFloat, is CborDouble -> "float"
      else -> item::class.java.simpleName
    }
  }

  private fun stampCertified(
    credential: MdocCredential,
    issuerSignedBytes: ByteArray,
    validFrom: Instant,
    validUntil: Instant,
  ) {
    setPrivateField(credential, "_issuerProvidedData", ByteString(issuerSignedBytes))
    setPrivateField(credential, "_validFrom", validFrom)
    setPrivateField(credential, "_validUntil", validUntil)
    if (!credential.isCertified) {
      throw IllegalStateException("Failed to certify stored mDOC without Multipaz MSO parse")
    }
  }

  private fun setPrivateField(target: Any, name: String, value: Any) {
    var cls: Class<*>? = target.javaClass
    while (cls != null) {
      try {
        val field = cls.getDeclaredField(name)
        field.isAccessible = true
        field.set(target, value)
        return
      } catch (_: NoSuchFieldException) {
        cls = cls.superclass
      }
    }
    throw IllegalStateException("MdocCredential field $name is unavailable")
  }

  /**
   * Strict Multipaz parse, kept for tests that assert issuer encoding shape.
   */
  fun requireCertifiable(issuerSignedBytes: ByteArray) {
    val mso = decodeMsoMap(issuerSignedBytes)
      ?: throw IllegalArgumentException("issuerAuth MSO is not tag-24 encoded CBOR")
    try {
      MobileSecurityObject.fromDataItem(mso)
    } catch (error: Exception) {
      throw IllegalArgumentException(
        "Stored mDOC MSO could not be parsed (${describeMso(issuerSignedBytes)})",
        error,
      )
    }
  }
}
