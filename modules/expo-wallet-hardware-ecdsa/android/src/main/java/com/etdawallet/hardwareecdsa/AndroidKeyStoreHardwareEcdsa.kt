package com.etdawallet.hardwareecdsa

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.ECGenParameterSpec

internal object AndroidKeyStoreHardwareEcdsa {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val CURVE_NAME = "secp256r1"
  private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"

  fun createKey(alias: String, attestationChallenge: ByteArray?, authValiditySeconds: Int): CreateKeyNativeResult {
    if (AndroidKeyStoreProbe.hasKey(alias)) {
      throw WalletHardwareEcdsaException(
        "WalletHardwareEcdsaKeyAlreadyExists",
        "KeyAlreadyExists:$alias",
      )
    }

    val sanitizedValidity = authValiditySeconds.coerceAtLeast(1)
    val canRequestStrongBox = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P
    var strongBoxAttempted = false
    var strongBoxFallbackReason: String? = null
    var keyCreatePath = "tee-direct-no-strongbox"

    if (canRequestStrongBox) {
      strongBoxAttempted = true
      try {
        generateEcKey(alias, useStrongBox = true, attestationChallenge, sanitizedValidity)
        keyCreatePath = "strongbox"
      } catch (error: StrongBoxUnavailableException) {
        strongBoxFallbackReason = formatFallbackReason(error)
        generateEcKey(alias, useStrongBox = false, attestationChallenge, sanitizedValidity)
        keyCreatePath = "tee-after-strongbox-fallback"
      } catch (error: Throwable) {
        if (isExplicitStrongBoxUnavailable(error)) {
          strongBoxFallbackReason = formatFallbackReason(error)
          generateEcKey(alias, useStrongBox = false, attestationChallenge, sanitizedValidity)
          keyCreatePath = "tee-after-strongbox-fallback"
        } else {
          throw WalletHardwareEcdsaException(
            "WalletHardwareEcdsaCreateKeyFailed",
            error.message ?: "CreateKeyFailed",
            error,
          )
        }
      }
    } else {
      generateEcKey(alias, useStrongBox = false, attestationChallenge, sanitizedValidity)
      keyCreatePath = "tee-direct-no-strongbox"
    }

    val publicJwk: Map<String, String>
    val securityLevel: String
    val keyDiagnostics: Map<String, Any>
    val certificateChainDer: List<ByteArray>
    try {
      publicJwk = readPublicJwk(alias)
      securityLevel = AndroidKeyStoreProbe.getSecurityLevel(alias)
      keyDiagnostics = AndroidKeyStoreProbe.readKeyDiagnostics(alias)
      certificateChainDer =
        attestationChallenge?.let { readCertificateChainDer(alias) }
          ?: emptyList()
    } catch (error: Throwable) {
      deleteKeyQuietly(alias)
      throw error
    }

    if (attestationChallenge != null && certificateChainDer.isEmpty()) {
      deleteKeyQuietly(alias)
      throw WalletHardwareEcdsaException(
        "WalletHardwareEcdsaAttestationChainMissing",
        "AttestationChainMissing:$alias",
      )
    }

    val keyCreateDiagnostics =
      mutableMapOf<String, Any?>(
        "strongBoxAttempted" to strongBoxAttempted,
        "keyCreatePath" to keyCreatePath,
        "authValiditySeconds" to sanitizedValidity,
        "attestationRequested" to (attestationChallenge != null && attestationChallenge.isNotEmpty()),
      )
    if (strongBoxFallbackReason != null) {
      keyCreateDiagnostics["strongBoxFallbackReason"] = strongBoxFallbackReason
    }
    keyCreateDiagnostics.putAll(keyDiagnostics)

    return CreateKeyNativeResult(
      publicJwk = publicJwk,
      securityLevel = securityLevel,
      certificateChainDer = certificateChainDer,
      keyCreateDiagnostics = keyCreateDiagnostics,
    )
  }

  fun readPublicJwk(alias: String): Map<String, String> {
    val publicKey =
      AndroidKeyStoreProbe.loadPrivateKeyEntry(alias).certificate.publicKey as java.security.interfaces.ECPublicKey
    return EcP256Encoding.publicKeyToJwk(publicKey)
  }

  fun deleteKey(alias: String) {
    if (!AndroidKeyStoreProbe.hasKey(alias)) {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaKeyNotFound", "KeyNotFound:$alias")
    }

    val keyStore =
      KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
      }
    keyStore.deleteEntry(alias)

    if (AndroidKeyStoreProbe.hasKey(alias)) {
      throw WalletHardwareEcdsaException(
        "WalletHardwareEcdsaDeleteKeyFailed",
        "DeleteKeyFailed:$alias",
      )
    }
  }

  private fun generateEcKey(
    alias: String,
    useStrongBox: Boolean,
    attestationChallenge: ByteArray?,
    authValiditySeconds: Int,
  ) {
    val parameterSpec =
      buildKeyGenParameterSpec(
        alias = alias,
        useStrongBox = useStrongBox,
        attestationChallenge = attestationChallenge,
        authValiditySeconds = authValiditySeconds,
      )

    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
    generator.initialize(parameterSpec)
    generator.generateKeyPair()
  }

  private fun buildKeyGenParameterSpec(
    alias: String,
    useStrongBox: Boolean,
    attestationChallenge: ByteArray?,
    authValiditySeconds: Int,
  ): KeyGenParameterSpec {
    val builder =
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE_NAME))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(true)

    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(
        authValiditySeconds,
        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
      )
    } else {
      @Suppress("DEPRECATION")
      builder.setUserAuthenticationValidityDurationSeconds(authValiditySeconds)
    }

    if (attestationChallenge != null && attestationChallenge.isNotEmpty()) {
      builder.setAttestationChallenge(attestationChallenge)
    }

    if (useStrongBox && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
      builder.setIsStrongBoxBacked(true)
    }

    return builder.build()
  }

  private fun readCertificateChainDer(alias: String): List<ByteArray> {
    val keyStore =
      KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
      }
    val chain = keyStore.getCertificateChain(alias) ?: return emptyList()
    return chain.map { it.encoded }
  }

  private fun deleteKeyQuietly(alias: String) {
    runCatching { deleteKey(alias) }
  }

  private fun isExplicitStrongBoxUnavailable(error: Throwable): Boolean {
    var current: Throwable? = error
    while (current != null) {
      if (current is StrongBoxUnavailableException) return true
      current = current.cause
    }
    return false
  }

  private fun formatFallbackReason(error: Throwable): String {
    val type = error::class.java.simpleName
    val message = error.message?.take(160) ?: "no-message"
    return "$type:$message"
  }
}

internal data class CreateKeyNativeResult(
  val publicJwk: Map<String, String>,
  val securityLevel: String,
  val certificateChainDer: List<ByteArray>,
  val keyCreateDiagnostics: Map<String, Any?>,
)

internal class WalletHardwareEcdsaException(
  val code: String,
  override val message: String,
  cause: Throwable? = null,
) : Exception(message, cause)
