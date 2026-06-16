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
  private const val HARDWARE_KEYSTORE_CURVE_25519_VERSION = 200

  private val ED25519_SPKI_PREFIX = byteArrayOf(
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  )

  fun supportsSecureEnvironment(context: AppContext): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    if (!hasHardwareBackedCurve25519Keystore(context)) return false

    return try {
      Signature.getInstance(ED25519)
      createKeyPairGenerator()
      true
    } catch (_: Exception) {
      false
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

    if (encoded.size == ED25519_SPKI_PREFIX.size + 32) {
      val prefix = encoded.copyOfRange(0, ED25519_SPKI_PREFIX.size)
      if (prefix.contentEquals(ED25519_SPKI_PREFIX)) {
        return encoded.copyOfRange(ED25519_SPKI_PREFIX.size, encoded.size)
      }
    }

    throw CodedException("Ed25519PublicKeyEncodingUnsupported: expected raw 32-byte or RFC 8410 SPKI public key")
  }
}
