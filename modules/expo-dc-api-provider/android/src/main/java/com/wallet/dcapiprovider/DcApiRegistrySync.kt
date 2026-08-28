package com.wallet.dcapiprovider

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.util.Base64
import android.util.Log
import androidx.credentials.registry.digitalcredentials.mdoc.MdocEntry
import androidx.credentials.registry.digitalcredentials.mdoc.MdocField
import androidx.credentials.registry.digitalcredentials.openid4vp.OpenId4VpRegistry
import androidx.credentials.registry.provider.RegistryManager
import androidx.credentials.registry.provider.digitalcredentials.VerificationEntryDisplayProperties
import androidx.credentials.registry.provider.digitalcredentials.VerificationFieldDisplayProperties
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

private const val LOG_TAG = "DcApiProvider"
private const val REGISTRY_ID = "wallet-openid4vp-v1"

object DcApiRegistrySync {
  fun syncRegistry(context: Context, registryPayloadBase64: String): Int {
    val credentialBytes = decodePayload(registryPayloadBase64)
    if (credentialBytes.isEmpty()) {
      Log.w(LOG_TAG, "registry-payload-empty")
      return 0
    }

    val entries = parseMdocEntries(credentialBytes)
    if (entries.isEmpty()) {
      Log.w(LOG_TAG, "registry-entries-empty")
      return 0
    }

    val registryManager = RegistryManager.create(context)
    try {
      runBlocking {
        registryManager.registerCredentials(
          OpenId4VpRegistry(
            credentialEntries = entries,
            id = REGISTRY_ID,
          ),
        )
      }
      Log.i(
        LOG_TAG,
        "registered DC API credentials with OpenID4VP matcher (entries=${entries.size})",
      )
      return entries.size
    } catch (error: Exception) {
      Log.e(LOG_TAG, "registerCredentials failed", error)
      throw error
    }
  }

  private fun decodePayload(registryPayloadBase64: String): ByteArray {
    val trimmed = registryPayloadBase64.trim()
    if (trimmed.isEmpty()) return ByteArray(0)
    return Base64.decode(trimmed, Base64.DEFAULT)
  }

  private fun parseMdocEntries(payload: ByteArray): List<MdocEntry> {
    val jsonBytes = readJsonBytes(payload)
    if (jsonBytes.isEmpty()) return emptyList()

    val root = JSONObject(String(jsonBytes, Charsets.UTF_8))
    val credentials = root.optJSONObject("credentials") ?: return emptyList()
    val mdocByDocType = credentials.optJSONObject("mso_mdoc") ?: return emptyList()
    val entries = mutableListOf<MdocEntry>()
    val placeholderIcon = createPlaceholderIcon()

    for (docType in mdocByDocType.keys()) {
      val items = mdocByDocType.optJSONArray(docType) ?: continue
      for (index in 0 until items.length()) {
        val item = items.optJSONObject(index) ?: continue
        val entry = readMdocEntry(docType, item, placeholderIcon) ?: continue
        entries.add(entry)
      }
    }

    return entries
  }

  private fun readMdocEntry(
    docType: String,
    item: JSONObject,
    icon: Bitmap,
  ): MdocEntry? {
    val id = item.optString("id").trim()
    val title = item.optString("title").trim()
    if (id.isEmpty() || title.isEmpty()) return null

    val subtitle = item.optString("subtitle").trim().ifEmpty { docType }
    val fields = readMdocFields(item.optJSONObject("paths"))
    if (fields.isEmpty()) return null

    return MdocEntry(
      docType = docType,
      fields = fields,
      entryDisplayPropertySet =
        setOf(
          VerificationEntryDisplayProperties(
            title = title,
            subtitle = subtitle,
            icon = icon,
          ),
        ),
      id = id,
    )
  }

  private fun readMdocFields(paths: JSONObject?): List<MdocField> {
    if (paths == null) return emptyList()

    val fields = mutableListOf<MdocField>()
    for (namespace in paths.keys()) {
      val identifiers = paths.optJSONObject(namespace) ?: continue
      for (identifier in identifiers.keys()) {
        val fieldJson = identifiers.optJSONObject(identifier) ?: continue
        val display = fieldJson.optString("display").trim().ifEmpty { identifier }
        val fieldValue =
          if (fieldJson.has("value") && !fieldJson.isNull("value")) {
            fieldJson.get("value")
          } else {
            null
          }
        fields.add(
          MdocField(
            namespace = namespace,
            identifier = identifier,
            fieldValue = fieldValue,
            fieldDisplayPropertySet =
              setOf(
                VerificationFieldDisplayProperties(
                  displayName = display,
                  displayValue = fieldValue?.toString(),
                ),
              ),
          ),
        )
      }
    }
    return fields
  }

  private fun readJsonBytes(payload: ByteArray): ByteArray {
    if (payload.isEmpty()) return ByteArray(0)
    if (payload.size >= 4) {
      val offset = ByteBuffer.wrap(payload, 0, 4).order(ByteOrder.LITTLE_ENDIAN).int
      if (offset in 1 until payload.size) {
        return payload.copyOfRange(offset, payload.size)
      }
    }
    return payload
  }

  private fun createPlaceholderIcon(): Bitmap {
    return Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.DKGRAY) }
  }
}
