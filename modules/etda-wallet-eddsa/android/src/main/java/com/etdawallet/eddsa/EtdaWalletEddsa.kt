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
import java.security.spec.AlgorithmParameterSpec
import java.security.spec.ECGenParameterSpec
import java.util.UUID

object EtdaWalletEddsa {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val ED25519 = "Ed25519"
  private const val TAG = "EtdaWalletEddsa"
  private const val HARDWARE_KEYSTORE_CURVE_25519_VERSION = 200
  private const val PROBE_KEY_ALIAS = "etda_eddsa_probe"

  @Volatile private var cachedSupportResult: Boolean? = null

  fun supportsSecureEnvironment(context: AppContext): Boolean {
    cachedSupportResult?.let { return it }
    val result = probeEd25519KeygenSupport(context)
    cachedSupportResult = result
    return result
  }

  fun getEd25519Diagnostics(context: AppContext): Map<String, Any?> {
    val reactContext = context.reactContext ?: throw Exceptions.ReactContextLost()
    val packageManager = reactContext.packageManager
    val recipes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      collectDiagnosticRecipes()
    } else {
      emptyList()
    }

    return mapOf(
      "sdkInt" to Build.VERSION.SDK_INT,
      "deviceModel" to Build.MODEL,
      "hasHardwareKeystore" to packageManager.hasSystemFeature(PackageManager.FEATURE_HARDWARE_KEYSTORE),
      "hasCurve25519HardwareKeystore" to hasHardwareBackedCurve25519Keystore(context),
      "hasStrongBoxKeystore" to packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE),
      "supported" to recipes.any(::isSupportedDiagnosticRecipe),
      "recipes" to recipes,
    )
  }

  private fun probeEd25519KeygenSupport(context: AppContext): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    if (!hasHardwareBackedCurve25519Keystore(context)) return false

    runEd25519Diagnostics()

    return try {
      val spec = KeyGenParameterSpec.Builder(
        PROBE_KEY_ALIAS,
        KeyProperties.PURPOSE_SIGN,
      ).build()
      KeyPairGenerator.getInstance(ED25519, ANDROID_KEYSTORE).apply {
        initialize(spec)
        generateKeyPair()
      }
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
      val entry = ks.getEntry(PROBE_KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
      val publicKey = entry?.certificate?.publicKey
      val supported = entry != null &&
        publicKey != null &&
        looksLikeEd25519PublicKey(publicKey) &&
        canSignAndVerify(entry.privateKey, publicKey) &&
        isHardwareBackedKey(entry.privateKey)
      if (!supported) {
        Log.w(
          TAG,
          "Ed25519 probe: alg=${entry?.privateKey?.algorithm}, publicEd25519=${publicKey?.let { looksLikeEd25519PublicKey(it) }}, signVerify=${if (entry != null && publicKey != null) canSignAndVerify(entry.privateKey, publicKey) else false}",
        )
      }
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
        KeyProperties.PURPOSE_SIGN,
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
      if (!looksLikeEd25519PublicKey(generatedPubKey) || !canSignAndVerify(generatedPrivKey, generatedPubKey)) {
        throw IllegalStateException(
          "AndroidKeyStore generated ${generatedPrivKey.algorithm} but it is not a usable Ed25519 signing key"
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

  fun authenticateWeakBiometric(
    context: AppContext,
    promptMessage: String,
    cancelButtonText: String,
    promise: Promise,
  ) {
    try {
      EtdaWalletWeakBiometrics(
        context,
        promptMessage,
        cancelButtonText,
        { promise.resolve(true) },
        { promise.resolve(false) },
        { code: Number, msg: String -> promise.reject(CodedException("WeakBiometricFailed: code: $code, msg: $msg")) },
      ).authenticate()
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

  private fun runEd25519Diagnostics() {
    Log.i(TAG, "=== Ed25519 Keygen Diagnostic ===")
    collectDiagnosticRecipes().forEach { recipe ->
      Log.i(
        TAG,
        "[${recipe["label"]}] requested=${recipe["requestedAlgorithm"]} alg=${recipe["privateKeyAlgorithm"]} publicAlg=${recipe["publicKeyAlgorithm"]} spki=${recipe["publicKeyEncodedBytes"]}b [${recipe["publicKeySpkiPrefix"]}...] ed25519=${recipe["publicKeyLooksEd25519"]} signVerify=${recipe["signVerifyOk"]} secLevel=${recipe["securityLevel"]}/${recipe["securityLevelLabel"]} hardware=${recipe["hardwareBacked"]} error=${recipe["errorClass"]}:${recipe["errorMessage"]}",
      )
    }
    Log.i(TAG, "=== Ed25519 Keygen Diagnostic End ===")
  }

  private fun collectDiagnosticRecipes(): List<Map<String, Any?>> {
    return listOf(
      diagnosticRecipe("R1-Ed25519-sign", ED25519, null, KeyProperties.PURPOSE_SIGN),
      diagnosticRecipe("R2-Ed25519-sign-verify", ED25519, null, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY),
      diagnosticRecipe("R3-EC-ed25519lower", "EC", ECGenParameterSpec("ed25519"), KeyProperties.PURPOSE_SIGN),
      diagnosticRecipe("R4-EC-Ed25519upper", "EC", ECGenParameterSpec("Ed25519"), KeyProperties.PURPOSE_SIGN),
      diagnosticRecipe("R5-Ed25519-no-sb", ED25519, null, KeyProperties.PURPOSE_SIGN, strongBoxBacked = false),
      diagnosticRecipe("R6-Ed25519-sb", ED25519, null, KeyProperties.PURPOSE_SIGN, strongBoxBacked = true),
      diagnosticRecipe(
        "R7-Ed25519-digest-none",
        ED25519,
        null,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        digests = arrayOf(KeyProperties.DIGEST_NONE),
      ),
    )
  }

  private fun diagnosticRecipe(
    label: String,
    algorithm: String,
    algSpec: AlgorithmParameterSpec?,
    purposes: Int,
    strongBoxBacked: Boolean? = null,
    digests: Array<String>? = null,
  ): Map<String, Any?> {
    val alias = "etda_diag_${label.take(20)}_${UUID.randomUUID()}"
    val result = mutableMapOf<String, Any?>(
      "label" to label,
      "requestedAlgorithm" to algorithm,
      "requestedPurposes" to purposes,
      "algorithmParameterSpec" to describeAlgorithmSpec(algSpec),
    )
    if (strongBoxBacked != null) result["requestedStrongBoxBacked"] = strongBoxBacked
    if (digests != null) result["requestedDigests"] = digests.toList()

    try {
      val specBuilder = KeyGenParameterSpec.Builder(alias, purposes).apply {
        if (algSpec != null) setAlgorithmParameterSpec(algSpec)
        if (digests != null) setDigests(*digests)
        if (strongBoxBacked != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          setIsStrongBoxBacked(strongBoxBacked)
        }
      }
      KeyPairGenerator.getInstance(algorithm, ANDROID_KEYSTORE).apply {
        initialize(specBuilder.build())
        generateKeyPair()
      }
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
      val entry = ks.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
      val privKey = entry?.privateKey
      val pubKey = entry?.certificate?.publicKey
      val spki = pubKey?.encoded ?: byteArrayOf()
      val keyInfoResult = privKey?.let { readKeyInfo(it, algorithm) }
      val keyInfo = keyInfoResult?.first
      val securityLevel = readSecurityLevel(keyInfo)

      result["privateKeyAlgorithm"] = privKey?.algorithm
      result["publicKeyAlgorithm"] = pubKey?.algorithm
      result["publicKeyFormat"] = pubKey?.format
      result["publicKeyEncodedBytes"] = spki.size
      result["publicKeySpkiPrefix"] = spki.take(8).joinToString("") { "%02x".format(it) }
      result["publicKeyLooksEd25519"] = pubKey?.let { looksLikeEd25519PublicKey(it) } ?: false
      result["signVerifyOk"] = if (privKey != null && pubKey != null) canSignAndVerify(privKey, pubKey) else false
      result["keyInfoAlgorithm"] = keyInfoResult?.second
      result["securityLevel"] = securityLevel
      result["securityLevelLabel"] = securityLevelLabel(securityLevel)
      result["hardwareBacked"] = isHardwareBackedSecurityLevel(securityLevel)
      result["userAuthenticationRequired"] = keyInfo?.isUserAuthenticationRequired
      result["userAuthenticationHardwareEnforced"] = keyInfo?.isUserAuthenticationRequirementEnforcedBySecureHardware
    } catch (e: Exception) {
      result["errorClass"] = e.javaClass.simpleName
      result["errorMessage"] = e.message
    } finally {
      try { deleteKey(alias) } catch (_: Exception) {}
    }
    return result
  }

  private fun isSupportedDiagnosticRecipe(recipe: Map<String, Any?>): Boolean {
    return recipe["publicKeyLooksEd25519"] == true &&
      recipe["signVerifyOk"] == true &&
      recipe["hardwareBacked"] == true
  }

  private fun createKeyPairGenerator(): KeyPairGenerator {
    return KeyPairGenerator.getInstance(ED25519, ANDROID_KEYSTORE)
  }

  private fun assertHardwareBackedKey(keyId: String) {
    val privateKey = getKeypair(keyId).first
    if (!isHardwareBackedKey(privateKey)) {
      throw CodedException("Ed25519KeyNotHardwareBacked: generated key is not TEE or StrongBox backed")
    }
  }

  private fun isHardwareBackedKey(privateKey: PrivateKey): Boolean {
    return isHardwareBackedSecurityLevel(readSecurityLevel(readKeyInfo(privateKey, ED25519)?.first))
  }

  private fun readKeyInfo(privateKey: PrivateKey, requestedAlgorithm: String): Pair<KeyInfo, String>? {
    val algorithms = listOf(ED25519, requestedAlgorithm, privateKey.algorithm).distinct()
    for (algorithm in algorithms) {
      try {
        return Pair(
          KeyFactory
            .getInstance(algorithm, ANDROID_KEYSTORE)
            .getKeySpec(privateKey, KeyInfo::class.java),
          algorithm,
        )
      } catch (_: Exception) {
        // Some providers expose Ed25519 under its OID, so try every plausible name.
      }
    }
    return null
  }

  private fun readSecurityLevel(keyInfo: KeyInfo?): Int {
    if (keyInfo == null) return -1
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      keyInfo.securityLevel
    } else {
      @Suppress("DEPRECATION")
      if (keyInfo.isInsideSecureHardware) 99 else KeyProperties.SECURITY_LEVEL_SOFTWARE
    }
  }

  private fun isHardwareBackedSecurityLevel(securityLevel: Int): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
        securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
    } else {
      securityLevel == 99
    }
  }

  private fun securityLevelLabel(securityLevel: Int): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && securityLevel == 99) {
      return "INSIDE_SECURE_HARDWARE"
    }
    return when (securityLevel) {
      KeyProperties.SECURITY_LEVEL_UNKNOWN -> "UNKNOWN"
      KeyProperties.SECURITY_LEVEL_UNKNOWN_SECURE -> "UNKNOWN_SECURE"
      KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
      KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TRUSTED_ENVIRONMENT"
      KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
      else -> "UNAVAILABLE"
    }
  }

  private fun canSignAndVerify(privateKey: PrivateKey, publicKey: PublicKey): Boolean {
    return try {
      val message = "etda-ed25519-diagnostic".toByteArray(Charsets.UTF_8)
      val signatureBytes = Signature.getInstance(ED25519).apply {
        initSign(privateKey)
        update(message)
      }.sign()
      Signature.getInstance(ED25519).apply {
        initVerify(publicKey)
        update(message)
      }.verify(signatureBytes)
    } catch (_: Exception) {
      false
    }
  }

  private fun describeAlgorithmSpec(algSpec: AlgorithmParameterSpec?): String? {
    return when (algSpec) {
      null -> null
      is ECGenParameterSpec -> "ECGenParameterSpec(${algSpec.name})"
      else -> algSpec.javaClass.simpleName
    }
  }

  private fun looksLikeEd25519PublicKey(publicKey: PublicKey): Boolean {
    val encoded = publicKey.encoded
    if (encoded.size == 32) return true
    if (!containsEd25519Oid(encoded)) return false
    if (encoded.size < 35) return false
    val bsOffset = encoded.size - 35
    return encoded[bsOffset] == 0x03.toByte() &&
      encoded[bsOffset + 1] == 0x21.toByte() &&
      encoded[bsOffset + 2] == 0x00.toByte()
  }

  private fun containsEd25519Oid(encoded: ByteArray): Boolean {
    val oid = byteArrayOf(0x06, 0x03, 0x2b, 0x65, 0x70)
    if (encoded.size < oid.size) return false
    for (offset in 0..(encoded.size - oid.size)) {
      var matches = true
      for (index in oid.indices) {
        if (encoded[offset + index] != oid[index]) {
          matches = false
          break
        }
      }
      if (matches) return true
    }
    return false
  }

  private fun rawEd25519PublicKey(publicKey: PublicKey): ByteArray {
    val encoded = publicKey.encoded
    if (encoded.size == 32) return encoded

    if (encoded.size >= 35 && containsEd25519Oid(encoded)) {
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
