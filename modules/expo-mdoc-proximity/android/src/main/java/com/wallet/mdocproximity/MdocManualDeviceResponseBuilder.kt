package com.wallet.mdocproximity

import com.etdawallet.mdocproximity.ApprovedMdocFieldCeiling
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.CborArray
import org.multipaz.cbor.CborMap
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Simple
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.addCborMap
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.putCborArray
import org.multipaz.cbor.putCborMap

/**
 * Builds ISO 18013-5 DeviceResponse without Multipaz [org.multipaz.mdoc.response.DeviceResponse].
 * Multipaz rebuilds `issuerAuth` and drops `x5chain` from COSE_Sign1 unprotected headers, which
 * digital-credentials.dev rejects. CMWallet embeds the original filtered `issuerSigned` bytes.
 */
object MdocManualDeviceResponseBuilder {
  private val ES256_PROTECTED = Cbor.encode(
    buildCborMap {
      put(1, -7L)
    },
  )

  fun filterIssuerSigned(
    issuerSignedBytes: ByteArray,
    approvedNamespaceKeys: List<String>,
  ): ByteArray {
    require(approvedNamespaceKeys.isNotEmpty()) { "Approved namespace keys are required" }
    val root = Cbor.decode(issuerSignedBytes) as? CborMap
      ?: throw IllegalArgumentException("issuerSigned must be a CBOR map")
    val nameSpaces = root.optional("nameSpaces") as? CborMap
      ?: throw IllegalArgumentException("issuerSigned.nameSpaces is required")

    val approvedByNamespace = approvedNamespaceKeys
      .distinct()
      .map(::splitApprovedNamespaceKey)
      .groupBy({ it.first }, { it.second })
      .mapValues { (_, identifiers) -> identifiers.toSet() }

    val filteredNameSpaces = buildCborMap {
      approvedByNamespace.forEach { (namespace, identifiers) ->
        val elements = nameSpaces[namespace] as? CborArray
          ?: throw IllegalArgumentException("Missing namespace $namespace")
        val filtered = elements.asArray.filter { item ->
          readElementIdentifier(item) in identifiers
        }
        if (filtered.isEmpty()) {
          throw IllegalArgumentException("No approved elements in namespace $namespace")
        }
        putCborArray(namespace) {
          filtered.forEach(::add)
        }
      }
    }

    return Cbor.encode(
      buildCborMap {
        root.items.forEach { (key, value) ->
          val label = (key as? Tstr)?.value ?: return@forEach
          if (label == "nameSpaces") {
            put("nameSpaces", filteredNameSpaces)
          } else {
            put(label, value)
          }
        }
      },
    )
  }

  suspend fun build(
    docType: String,
    issuerSignedBytes: ByteArray,
    sessionTranscript: DataItem,
    sign: suspend (ByteArray) -> ByteArray,
    deviceNamespaces: DataItem = buildCborMap {},
  ): ByteArray {
    require(docType.isNotBlank()) { "docType is required" }

    val deviceNamespacesTag = Tagged(Tagged.ENCODED_CBOR, Bstr(Cbor.encode(deviceNamespaces)))
    val deviceAuthentication = buildCborArray {
      add("DeviceAuthentication")
      add(sessionTranscript)
      add(docType)
      add(deviceNamespacesTag)
    }
    val deviceAuthenticationBytes = Tagged(
      Tagged.ENCODED_CBOR,
      Bstr(Cbor.encode(deviceAuthentication)),
    )

    val signatureStructure = buildCborArray {
      add("Signature1")
      add(Bstr(ES256_PROTECTED))
      add(Bstr(byteArrayOf()))
      add(Bstr(Cbor.encode(deviceAuthenticationBytes)))
    }
    val signatureBytes = sign(Cbor.encode(signatureStructure))
    require(signatureBytes.size == 64) { "ES256 device signature must be 64-byte r||s" }

    val deviceSignature = buildCborArray {
      add(Bstr(ES256_PROTECTED))
      addCborMap {}
      add(Simple.NULL)
      add(Bstr(signatureBytes))
    }

    val deviceSigned = buildCborMap {
      put("nameSpaces", deviceNamespacesTag)
      putCborMap("deviceAuth") {
        put("deviceSignature", deviceSignature)
      }
    }

    val issuerSigned = Cbor.decode(issuerSignedBytes)
    return Cbor.encode(
      buildCborMap {
        put("version", "1.0")
        putCborArray("documents") {
          addCborMap {
            put("docType", docType)
            put("issuerSigned", issuerSigned)
            put("deviceSigned", deviceSigned)
          }
        }
        put("status", 0L)
      },
    )
  }

  private fun splitApprovedNamespaceKey(key: String): Pair<String, String> {
    val slash = key.lastIndexOf('/')
    val parsed = if (slash > 0) {
      key.substring(0, slash) to key.substring(slash + 1)
    } else {
      ApprovedMdocFieldCeiling.splitFieldKey(key)
    }
    require(parsed.first.isNotBlank() && parsed.second.isNotBlank()) {
      "Approved namespace key is invalid"
    }
    return parsed
  }

  private fun readElementIdentifier(item: DataItem): String {
    val encodedItem = when (item) {
      is Tagged -> {
        if (item.tagNumber != Tagged.ENCODED_CBOR) {
          throw IllegalArgumentException("IssuerSignedItem must be tag 24")
        }
        item.taggedItem
      }
      else -> item
    }
    val encoded = encodedItem as? Bstr
      ?: throw IllegalArgumentException("IssuerSignedItem payload must be a byte string")
    val decoded = Cbor.decode(encoded.value) as? CborMap
      ?: throw IllegalArgumentException("IssuerSignedItem must decode to a map")
    return decoded["elementIdentifier"].asTstr
  }

  private fun CborMap.optional(key: String): DataItem? = try {
    this[key]
  } catch (_: Exception) {
    null
  }
}
