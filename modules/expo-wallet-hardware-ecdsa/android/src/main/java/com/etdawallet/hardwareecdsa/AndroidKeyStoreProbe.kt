package com.etdawallet.hardwareecdsa

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.security.KeyFactory
import java.security.KeyStore
import java.security.KeyStore.PrivateKeyEntry

internal object AndroidKeyStoreProbe {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"

  fun hasKey(alias: String): Boolean {
    val keyStore = openKeyStore()
    return keyStore.containsAlias(alias)
  }

  fun getSecurityLevel(alias: String): String {
    val keyInfo = loadKeyInfo(alias)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      return when (keyInfo.securityLevel) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
        else -> "TEE"
      }
    }

    @Suppress("DEPRECATION")
    return if (keyInfo.isInsideSecureHardware) {
      "TEE"
    } else {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaKeyNotHardwareBacked", "KeyNotHardwareBacked:$alias")
    }
  }

  fun loadPrivateKeyEntry(alias: String): PrivateKeyEntry {
    if (!hasKey(alias)) {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaKeyNotFound", "KeyNotFound:$alias")
    }

    val keyStore = openKeyStore()
    val entry = keyStore.getEntry(alias, null)
    if (entry !is PrivateKeyEntry) {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaKeyNotFound", "KeyEntryInvalid:$alias")
    }
    return entry
  }

  private fun loadKeyInfo(alias: String): KeyInfo {
    val entry = loadPrivateKeyEntry(alias)
    val keyFactory = KeyFactory.getInstance(entry.privateKey.algorithm, ANDROID_KEYSTORE)
    return keyFactory.getKeySpec(entry.privateKey, KeyInfo::class.java)
  }

  fun readKeyStoreCapabilities(context: Context): Map<String, Any> {
    val strongBoxFeatureAvailable =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)

    return mapOf(
      "apiLevel" to Build.VERSION.SDK_INT,
      "strongBoxFeatureAvailable" to strongBoxFeatureAvailable,
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
    )
  }

  fun readKeyDiagnostics(alias: String): Map<String, Any> {
    val keyInfo = loadKeyInfo(alias)
    val diagnostics = mutableMapOf<String, Any>(
      "isUserAuthenticationRequired" to keyInfo.isUserAuthenticationRequired,
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      @Suppress("DEPRECATION")
      diagnostics["isInsideSecureHardware"] = keyInfo.isInsideSecureHardware
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      diagnostics["keyInfoSecurityLevel"] = securityLevelLabel(keyInfo.securityLevel)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      diagnostics["userAuthEnforcedBySecureHardware"] =
        keyInfo.isUserAuthenticationRequirementEnforcedBySecureHardware
    }

    return diagnostics
  }

  private fun securityLevelLabel(level: Int): String =
    when (level) {
      KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
      KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
      KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
      else -> "UNKNOWN_$level"
    }

  private fun openKeyStore(): KeyStore =
    KeyStore.getInstance(ANDROID_KEYSTORE).apply {
      load(null)
    }
}
