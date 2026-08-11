package com.etdawallet.hardwareecdsa

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Standalone StrongBox KeyMint probe aligned with Android docs:
 * - Check [PackageManager.FEATURE_STRONGBOX_KEYSTORE]
 * - Request StrongBox via [KeyGenParameterSpec.Builder.setIsStrongBoxBacked]
 * - Fall back without StrongBox only on [StrongBoxUnavailableException]
 */
internal object StrongBoxKeyMintProbe {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val CURVE_NAME = "secp256r1"
  private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
  private const val PROBE_ALIAS_PREFIX = "wallet.probe.strongbox-keymint"

  fun run(context: Context, walletAuthValiditySeconds: Int = 30): Map<String, Any?> {
    val alias = "$PROBE_ALIAS_PREFIX.${System.currentTimeMillis()}"
    val walletAlias = "$PROBE_ALIAS_PREFIX.wallet.${System.currentTimeMillis()}"
    val steps = mutableListOf<Map<String, Any?>>()
    val featureStrongBoxKeystore = readStrongBoxFeature(context)

    steps.add(
      mapOf(
        "step" to "feature_check",
        "featureStrongBoxKeystore" to featureStrongBoxKeystore,
        "apiLevel" to Build.VERSION.SDK_INT,
        "manufacturer" to Build.MANUFACTURER,
        "model" to Build.MODEL,
      ),
    )

    deleteAliasQuietly(alias)

    var strongBoxRequested = false
    var strongBoxFallback = false
    var strongBoxUnavailableExceptionClass: String? = null
    var strongBoxUnavailableExceptionMessage: String? = null
    var keyCreatePath = "tee-direct"

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        strongBoxRequested = true
        try {
          generateProbeKey(alias, useStrongBox = true)
          keyCreatePath = "strongbox"
          steps.add(
            mapOf(
              "step" to "keygen_strongbox",
              "status" to "ok",
              "setIsStrongBoxBacked" to true,
            ),
          )
        } catch (error: StrongBoxUnavailableException) {
          strongBoxFallback = true
          strongBoxUnavailableExceptionClass = error::class.java.name
          strongBoxUnavailableExceptionMessage = error.message ?: "no-message"
          deleteAliasQuietly(alias)
          generateProbeKey(alias, useStrongBox = false)
          keyCreatePath = "tee-after-strongbox-unavailable"
          steps.add(
            mapOf(
              "step" to "keygen_strongbox",
              "status" to "StrongBoxUnavailableException",
              "setIsStrongBoxBacked" to true,
              "exceptionClass" to strongBoxUnavailableExceptionClass,
              "exceptionMessage" to strongBoxUnavailableExceptionMessage,
            ),
          )
          steps.add(
            mapOf(
              "step" to "keygen_tee_fallback",
              "status" to "ok",
              "setIsStrongBoxBacked" to false,
            ),
          )
        }
      } else {
        generateProbeKey(alias, useStrongBox = false)
        keyCreatePath = "tee-api-too-low"
        steps.add(
          mapOf(
            "step" to "keygen_tee_direct",
            "status" to "ok",
            "setIsStrongBoxBacked" to false,
            "reason" to "API < 28 cannot call setIsStrongBoxBacked(true)",
          ),
        )
      }

      val securityLevel = AndroidKeyStoreProbe.getSecurityLevel(alias)
      val keyDiagnostics = AndroidKeyStoreProbe.readKeyDiagnostics(alias)
      val signVerify = signAndVerifyProbe(alias)

      val walletProbe =
        runWalletSpecProbe(
          walletAlias = walletAlias,
          authValiditySeconds = walletAuthValiditySeconds.coerceAtLeast(1),
          steps = steps,
        )

      steps.add(
        mapOf(
          "step" to "keyinfo",
          "securityLevel" to securityLevel,
          "diagnostics" to keyDiagnostics,
        ),
      )
      steps.add(
        mapOf(
          "step" to "sign_verify",
          "ok" to signVerify.ok,
          "signatureBytes" to signVerify.signatureBytes,
          "error" to signVerify.error,
        ),
      )

      val strongBoxPass =
        strongBoxRequested &&
          !strongBoxFallback &&
          securityLevel == "STRONGBOX" &&
          signVerify.ok

      val walletStrongBoxPass =
        walletProbe.strongBoxRequested &&
          !walletProbe.strongBoxFallback &&
          walletProbe.securityLevel == "STRONGBOX"

      val knoxVaultStrongBoxPathAvailable = strongBoxPass
      val knoxVaultWalletKeyPathAvailable = walletStrongBoxPass

      val teeFallbackPass =
        strongBoxFallback &&
          securityLevel == "TEE" &&
          signVerify.ok

      val teeDirectPass =
        !strongBoxRequested &&
          securityLevel == "TEE" &&
          signVerify.ok

      val overallPass = signVerify.ok && (strongBoxPass || teeFallbackPass || teeDirectPass)

      deleteAliasQuietly(alias)
      deleteAliasQuietly(walletAlias)
      steps.add(
        mapOf(
          "step" to "cleanup",
          "aliasDeleted" to !AndroidKeyStoreProbe.hasKey(alias),
          "walletAliasDeleted" to !AndroidKeyStoreProbe.hasKey(walletAlias),
        ),
      )

      return mapOf(
        "featureStrongBoxKeystore" to featureStrongBoxKeystore,
        "strongBoxRequested" to strongBoxRequested,
        "strongBoxFallback" to strongBoxFallback,
        "strongBoxUnavailableExceptionClass" to strongBoxUnavailableExceptionClass,
        "strongBoxUnavailableExceptionMessage" to strongBoxUnavailableExceptionMessage,
        "keyCreatePath" to keyCreatePath,
        "securityLevel" to securityLevel,
        "signVerifyOk" to signVerify.ok,
        "strongBoxPass" to strongBoxPass,
        "walletSpecStrongBoxRequested" to walletProbe.strongBoxRequested,
        "walletSpecStrongBoxFallback" to walletProbe.strongBoxFallback,
        "walletSpecStrongBoxUnavailableExceptionClass" to walletProbe.strongBoxUnavailableExceptionClass,
        "walletSpecStrongBoxUnavailableExceptionMessage" to walletProbe.strongBoxUnavailableExceptionMessage,
        "walletSpecKeyCreatePath" to walletProbe.keyCreatePath,
        "walletSpecSecurityLevel" to walletProbe.securityLevel,
        "walletSpecStrongBoxPass" to walletStrongBoxPass,
        "knoxVaultStrongBoxPathAvailable" to knoxVaultStrongBoxPathAvailable,
        "knoxVaultWalletKeyPathAvailable" to knoxVaultWalletKeyPathAvailable,
        "teeFallbackPass" to teeFallbackPass,
        "teeDirectPass" to teeDirectPass,
        "overallPass" to overallPass,
        "probeAlias" to alias,
        "walletProbeAlias" to walletAlias,
        "steps" to steps,
      )
    } catch (error: Throwable) {
      steps.add(
        mapOf(
          "step" to "probe_failed",
          "errorClass" to error::class.java.simpleName,
          "errorMessage" to (error.message?.take(200) ?: "no-message"),
        ),
      )
      deleteAliasQuietly(alias)
      deleteAliasQuietly(walletAlias)
      steps.add(
        mapOf(
          "step" to "cleanup",
          "aliasDeleted" to !AndroidKeyStoreProbe.hasKey(alias),
          "walletAliasDeleted" to !AndroidKeyStoreProbe.hasKey(walletAlias),
        ),
      )
      return mapOf(
        "featureStrongBoxKeystore" to featureStrongBoxKeystore,
        "strongBoxRequested" to strongBoxRequested,
        "strongBoxFallback" to strongBoxFallback,
        "strongBoxUnavailableExceptionClass" to strongBoxUnavailableExceptionClass,
        "strongBoxUnavailableExceptionMessage" to strongBoxUnavailableExceptionMessage,
        "keyCreatePath" to keyCreatePath,
        "overallPass" to false,
        "probeAlias" to alias,
        "walletProbeAlias" to walletAlias,
        "steps" to steps,
        "errorClass" to error::class.java.simpleName,
        "errorMessage" to (error.message?.take(200) ?: "no-message"),
      )
    }
  }

  private fun readStrongBoxFeature(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)

  private fun generateProbeKey(alias: String, useStrongBox: Boolean) {
    val builder =
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
        .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE_NAME))
        .setDigests(KeyProperties.DIGEST_SHA256)

    if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      builder.setIsStrongBoxBacked(true)
    }

    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
    generator.initialize(builder.build())
    generator.generateKeyPair()
  }

  private fun runWalletSpecProbe(
    walletAlias: String,
    authValiditySeconds: Int,
    steps: MutableList<Map<String, Any?>>,
  ): WalletSpecProbeResult {
    deleteAliasQuietly(walletAlias)

    var strongBoxRequested = false
    var strongBoxFallback = false
    var strongBoxUnavailableExceptionClass: String? = null
    var strongBoxUnavailableExceptionMessage: String? = null
    var keyCreatePath = "tee-direct"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      strongBoxRequested = true
      try {
        generateWalletSpecProbeKey(walletAlias, useStrongBox = true, authValiditySeconds)
        keyCreatePath = "strongbox"
        steps.add(
          mapOf(
            "step" to "wallet_spec_keygen_strongbox",
            "status" to "ok",
            "setIsStrongBoxBacked" to true,
            "userAuthenticationRequired" to true,
            "authValiditySeconds" to authValiditySeconds,
          ),
        )
      } catch (error: StrongBoxUnavailableException) {
        strongBoxFallback = true
        strongBoxUnavailableExceptionClass = error::class.java.name
        strongBoxUnavailableExceptionMessage = error.message ?: "no-message"
        deleteAliasQuietly(walletAlias)
        generateWalletSpecProbeKey(walletAlias, useStrongBox = false, authValiditySeconds)
        keyCreatePath = "tee-after-strongbox-unavailable"
        steps.add(
          mapOf(
            "step" to "wallet_spec_keygen_strongbox",
            "status" to "StrongBoxUnavailableException",
            "exceptionClass" to strongBoxUnavailableExceptionClass,
            "exceptionMessage" to strongBoxUnavailableExceptionMessage,
          ),
        )
        steps.add(
          mapOf(
            "step" to "wallet_spec_keygen_tee_fallback",
            "status" to "ok",
            "setIsStrongBoxBacked" to false,
          ),
        )
      }
    } else {
      generateWalletSpecProbeKey(walletAlias, useStrongBox = false, authValiditySeconds)
      keyCreatePath = "tee-api-too-low"
      steps.add(
        mapOf(
          "step" to "wallet_spec_keygen_tee_direct",
          "status" to "ok",
          "reason" to "API < 28 cannot call setIsStrongBoxBacked(true)",
        ),
      )
    }

    val securityLevel =
      try {
        AndroidKeyStoreProbe.getSecurityLevel(walletAlias)
      } catch (error: Throwable) {
        "unknown"
      }

    steps.add(
      mapOf(
        "step" to "wallet_spec_keyinfo",
        "securityLevel" to securityLevel,
        "diagnostics" to
          runCatching { AndroidKeyStoreProbe.readKeyDiagnostics(walletAlias) }
            .getOrElse { emptyMap<String, Any>() },
      ),
    )

    return WalletSpecProbeResult(
      strongBoxRequested = strongBoxRequested,
      strongBoxFallback = strongBoxFallback,
      strongBoxUnavailableExceptionClass = strongBoxUnavailableExceptionClass,
      strongBoxUnavailableExceptionMessage = strongBoxUnavailableExceptionMessage,
      keyCreatePath = keyCreatePath,
      securityLevel = securityLevel,
    )
  }

  private fun generateWalletSpecProbeKey(
    alias: String,
    useStrongBox: Boolean,
    authValiditySeconds: Int,
  ) {
    val builder =
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE_NAME))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(
        authValiditySeconds,
        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
      )
    } else {
      @Suppress("DEPRECATION")
      builder.setUserAuthenticationValidityDurationSeconds(authValiditySeconds)
    }

    if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      builder.setIsStrongBoxBacked(true)
    }

    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
    generator.initialize(builder.build())
    generator.generateKeyPair()
  }

  private data class WalletSpecProbeResult(
    val strongBoxRequested: Boolean,
    val strongBoxFallback: Boolean,
    val strongBoxUnavailableExceptionClass: String?,
    val strongBoxUnavailableExceptionMessage: String?,
    val keyCreatePath: String,
    val securityLevel: String,
  )

  private fun signAndVerifyProbe(alias: String): SignVerifyResult {
    return try {
      val entry = AndroidKeyStoreProbe.loadPrivateKeyEntry(alias)
      val digest = ByteArray(32) { 0x2A }

      val signer = Signature.getInstance(SIGNATURE_ALGORITHM)
      signer.initSign(entry.privateKey)
      signer.update(digest)
      val signature = signer.sign()

      val verifier = Signature.getInstance(SIGNATURE_ALGORITHM)
      verifier.initVerify(entry.certificate.publicKey)
      verifier.update(digest)
      val ok = verifier.verify(signature)

      SignVerifyResult(ok = ok, signatureBytes = signature.size, error = null)
    } catch (error: Throwable) {
      SignVerifyResult(
        ok = false,
        signatureBytes = 0,
        error = formatThrowable(error),
      )
    }
  }

  private fun deleteAliasQuietly(alias: String) {
    runCatching {
      val keyStore =
        KeyStore.getInstance(ANDROID_KEYSTORE).apply {
          load(null)
        }
      if (keyStore.containsAlias(alias)) {
        keyStore.deleteEntry(alias)
      }
    }
  }

  private fun formatThrowable(error: Throwable): String {
    val message = error.message?.take(160) ?: "no-message"
    return "${error::class.java.simpleName}:$message"
  }

  private data class SignVerifyResult(
    val ok: Boolean,
    val signatureBytes: Int,
    val error: String?,
  )
}
