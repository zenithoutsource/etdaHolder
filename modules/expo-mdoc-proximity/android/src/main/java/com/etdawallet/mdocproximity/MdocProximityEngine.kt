package com.etdawallet.mdocproximity

import android.content.Context
import android.nfc.NfcAdapter
import android.os.Build
import expo.modules.kotlin.AppContext
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

object MdocProximityEngine {
  private const val STORAGE_DIR = "mdoc-proximity"
  private val presentationActive = AtomicBoolean(false)

  fun getAvailability(context: Context): Map<String, Any?> {
    val adapter = NfcAdapter.getDefaultAdapter(context)
    return mapOf(
      "platform" to "android",
      "sdkInt" to Build.VERSION.SDK_INT,
      "nfcSupported" to (adapter != null),
      "nfcEnabled" to (adapter?.isEnabled == true),
      "identityCredentialSupported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R),
      "presentationReady" to false,
    )
  }

  fun assertNfcReady(context: Context) {
    val adapter = NfcAdapter.getDefaultAdapter(context)
      ?: throw MdocProximityException(
        MdocProximityErrors.NFC_UNAVAILABLE,
        "NFC is not supported on this device",
      )

    if (!adapter.isEnabled) {
      throw MdocProximityException(
        MdocProximityErrors.NFC_DISABLED,
        "NFC is disabled",
      )
    }
  }

  private fun storageRoot(context: Context): File {
    val root = File(context.filesDir, STORAGE_DIR)
    if (!root.exists()) {
      root.mkdirs()
    }
    return root
  }

  private fun metadataFile(context: Context, credentialId: String): File =
    File(storageRoot(context), "$credentialId.meta.json")

  private fun mdocFile(context: Context, credentialId: String): File =
    File(storageRoot(context), "$credentialId.mdoc")

  fun storeMdoc(context: Context, credentialId: String, docType: String, mdocBytes: ByteArray) {
    if (credentialId.isBlank() || docType.isBlank() || mdocBytes.isEmpty()) {
      throw MdocProximityException(
        MdocProximityErrors.INVALID_ARGUMENT,
        "credentialId, docType, and mdocBytes are required",
      )
    }

    try {
      deleteMdoc(context, credentialId)
      mdocFile(context, credentialId).writeBytes(mdocBytes)
      val metadata = JSONObject()
        .put("credentialId", credentialId)
        .put("docType", docType)
        .put("storedAt", System.currentTimeMillis())
      metadataFile(context, credentialId).writeText(metadata.toString())
    } catch (error: Exception) {
      throw MdocProximityException(
        MdocProximityErrors.STORAGE_FAILED,
        error.message ?: "Failed to store mDOC",
      )
    }
  }

  fun hasMdoc(context: Context, credentialId: String): Boolean {
    if (credentialId.isBlank()) return false
    return mdocFile(context, credentialId).exists()
  }

  fun readMdoc(context: Context, credentialId: String): ByteArray {
    val file = mdocFile(context, credentialId)
    if (!file.exists()) {
      throw MdocProximityException(
        MdocProximityErrors.CREDENTIAL_NOT_FOUND,
        "No mDOC is stored for this credential",
      )
    }
    return file.readBytes()
  }

  fun deleteMdoc(context: Context, credentialId: String) {
    if (credentialId.isBlank()) return
    mdocFile(context, credentialId).delete()
    metadataFile(context, credentialId).delete()
  }

  fun startProximityPresentation(
    appContext: AppContext,
    credentialId: String,
    deviceKeyId: String,
  ) {
    val context = appContext.reactContext?.applicationContext
      ?: throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Application context is unavailable",
      )

    assertNfcReady(context)

    if (!hasMdoc(context, credentialId)) {
      throw MdocProximityException(
        MdocProximityErrors.CREDENTIAL_NOT_FOUND,
        "No mDOC is stored for this credential",
      )
    }

    if (!presentationActive.compareAndSet(false, true)) {
      throw MdocProximityException(
        MdocProximityErrors.PRESENTATION_ACTIVE,
        "A proximity presentation is already active",
      )
    }

    if (deviceKeyId.isBlank()) {
      presentationActive.set(false)
      throw MdocProximityException(
        MdocProximityErrors.INVALID_ARGUMENT,
        "deviceKeyId is required",
      )
    }

    // NFC engagement + BLE retrieval wiring lands in Phase 2D with the ACR1311U-N2 reader.
    // For now we only validate prerequisites and keep the session marked active so JS can
    // render the waiting UI until engagement events are implemented.
    readMdoc(context, credentialId)
  }

  fun stopProximityPresentation() {
    presentationActive.set(false)
  }

  fun isPresentationActive(): Boolean = presentationActive.get()
}
