package com.etdawallet.eddsa

import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Log
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature

object EtdaWalletEddsa {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val ED25519 = "Ed25519"
  private const val TAG = "EtdaWalletEddsa"
  // PackageManager.FEATURE_HARDWARE_KEYSTORE version 200 = KeyMint 2.0 (Curve25519 support)
  private const val HARDWARE_KEYSTORE_CURVE_25519_VERSION = 200
  private const val PROBE_KEY_ALIAS = "etda_eddsa_probe"

  @Volatile private var cachedSupportResult: Boolean? = null

  fun supportsSecureEnvironment(context: AppContext): Boolean {
    cachedSupportResult?.let { return it }
    val result = probeEd25519KeygenSupport(context)
    cachedSupportResult = result
    return result
  }

  private fun probeEd25519KeygenSupport(context: AppContext): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    if (!hasHardwareBackedCurve25519Keystore(context)) return false

    return try {
      val spec = KeyGenParameterSpec.Builder(
        PROBE_KEY_ALIAS,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
      ).build()
      KeyPairGenerator.getInstance(ED25519, ANDROID_KEYSTORE).apply {
        initialize(spec)
        generateKeyPair()
      }
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
      val entry = ks.getEntry(PROBE_KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
      val supported = entry?.privateKey?.algorithm == ED25519
      if (!supported) Log.w(TAG, "Ed25519 probe: device generated ${entry?.privateKey?.algorithm} instead of Ed25519")
      supported
    } catch (e: Exception) {
      Log.w(TAG, "Ed25519 probe failed: ${e.message}")
      false
    } finally {
      try { deleteKey(PROBE_KEY_ALIAS) } catch (_: Exception) {}
    }
  }

  fun generateKeypair(context: AppContext, keyId: String, biometricsBacked: Boolean) {
    assertSupported(context)
    assertKeyDoesNotExist(keyId)

    try {
      val spec = KeyGenParameterSpec.Builder(
        keyId,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
      )
        .apply {
          if (biometricsBacked) {
            setUserAuthenticationRequired(true)
            setInvalidatedByBiometricEnrollment(true)
            setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
          }
        }
        .build()

      createKeyPairGenerator().apply {
        initialize(spec)
        generateKeyPair()
      }

      val (generatedPrivKey, generatedPubKey) = getKeypair(keyId)
      if (generatedPrivKey.algorithm == "EC") {
        throw IllegalStateException(
          "AndroidKeyStore generated EC (P-256) instead of Ed25519 — device does not support hardware Ed25519 key generation"
        )
      }
      rawEd25519PublicKey(generatedPubKey)

      assertHardwareBackedKey(keyId)
    } catch (error: Exception) {
      deleteKey(keyId)
      Log.e(TAG, "Ed25519 key generation failed", error)
      throw CodedException("Ed25519KeyGenerationFailed: ${error.message}", error)
    }
  }

  fun getPublicBytesForKeyId(context: AppContext, keyId: String): ByteArray {
    assertSupported(context)
    return rawEd25519PublicKey(getKeypair(keyId).second)
  }

  fun sign(context: AppContext, keyId: String, message: ByteArray, biometricsBacked: Boolean, promise: Promise) {
    try {
      assertSupported(context)
      val privateKey = getKeypair(keyId).first
      val signature = Signature.getInstance(ED25519).apply {
        initSign(privateKey)
      }

      if (biometricsBacked) {
        EtdaWalletEddsaBiometrics(
          context,
          { sig: ByteArray -> promise.resolve(sig) },
          { code: Number, msg: String -> promise.reject(CodedException("code: $code, msg: $msg")) },
          message,
        ).authenticate(signature)
      } else {
        signature.update(message)
        promise.resolve(signature.sign())
      }
    } catch (error: Exception) {
      promise.reject(CodedException(error))
    }
  }

  fun deleteKey(context: AppContext, keyId: String) {
    assertSupported(context)
    deleteKey(keyId)
  }

  private fun deleteKey(keyId: String) {
    KeyStore.getInstance(ANDROID_KEYSTORE).apply {
      load(null)
      deleteEntry(keyId)
    }
  }

  private fun assertSupported(context: AppContext) {
    if (!supportsSecureEnvironment(context)) {
      throw CodedException("NativeEd25519SignerRequired: Android hardware-backed Ed25519 signer is unavailable")
    }
  }

  private fun hasHardwareBackedCurve25519Keystore(context: AppContext): Boolean {
    val reactContext = context.reactContext ?: throw Exceptions.ReactContextLost()
    return reactContext.packageManager.hasSystemFeature(
      PackageManager.FEATURE_HARDWARE_KEYSTORE,
      HARDWARE_KEYSTORE_CURVE_25519_VERSION,
    )
  }

  private fun assertKeyDoesNotExist(keyId: String) {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    if (keyStore.containsAlias(keyId)) {
      throw CodedException("Ed25519KeyAlreadyExists: key $keyId already exists")
    }
  }

  private fun getKeypair(keyId: String): Pair<PrivateKey, PublicKey> {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    val entry = keyStore.getEntry(keyId, null) as? KeyStore.PrivateKeyEntry
      ?: throw CodedException("Ed25519KeyNotFound: key $keyId was not found")

    return Pair(entry.privateKey, entry.certificate.publicKey)
  }

  private fun createKeyPairGenerator(): KeyPairGenerator {
    return KeyPairGenerator.getInstance(ED25519, ANDROID_KEYSTORE)
  }

  private fun assertHardwareBackedKey(keyId: String) {
    val privateKey = getKeypair(keyId).first
    val keyInfo = KeyFactory
      .getInstance(ED25519, ANDROID_KEYSTORE)
      .getKeySpec(privateKey, KeyInfo::class.java)

    val hardwareBacked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
        keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
    } else {
      @Suppress("DEPRECATION")
      keyInfo.isInsideSecureHardware
    }

    if (!hardwareBacked) {
      throw CodedException("Ed25519KeyNotHardwareBacked: generated key is not TEE or StrongBox backed")
    }
  }

  private fun rawEd25519PublicKey(publicKey: PublicKey): ByteArray {
    val encoded = publicKey.encoded
    if (encoded.size == 32) return encoded

    // In any valid SPKI the 32-byte Ed25519 point lives inside the last BIT STRING.
    // The BIT STRING header for a 32-byte payload is always [03 21 00].
    // Searching from the end handles both the standard 44-byte SPKI and alternative
    // encodings (e.g. 46 bytes when a NULL AlgorithmParameters element is present).
    if (encoded.size >= 35) {
      val bsOffset = encoded.size - 35
      if (encoded[bsOffset] == 0x03.toByte() &&
        encoded[bsOffset + 1] == 0x21.toByte() &&
        encoded[bsOffset + 2] == 0x00.toByte()
      ) {
        return encoded.copyOfRange(bsOffset + 3, encoded.size)
      }
    }

    Log.e(TAG, "Unexpected Ed25519 SPKI (${encoded.size} bytes): ${encoded.joinToString("") { "%02x".format(it) }}")
    throw CodedException("Ed25519PublicKeyEncodingUnsupported: got ${encoded.size}-byte key, expected raw 32-byte or RFC 8410 SPKI")
  }
}
