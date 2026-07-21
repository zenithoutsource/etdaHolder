package com.wallet.keystorediagnostics

import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Log
import expo.modules.kotlin.AppContext
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

/**
 * Diagnostics-only Keystore keygen probe. Answers "can this device generate a
 * hardware-backed Ed25519 key, and what does its keystore actually produce"
 * by attempting every plausible keygen recipe, capturing the resulting key
 * algorithm / security level / sign-verify outcome, and deleting the probe
 * key. Includes P-256 recipes as a hardware-capability control group.
 * It never persists keys and never exposes private key material.
 */
object WalletKeystoreDiagnostics {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val ED25519 = "Ed25519"
  private const val TAG = "WalletKeystoreDiag"
  private const val HARDWARE_KEYSTORE_CURVE_25519_VERSION = 200

  private data class SignatureProbeResult(
    val verified: Boolean,
    val signatureBytes: Int,
  )

  fun probe(context: AppContext): Map<String, Any?> {
    val reactContext = context.reactContext ?: throw Exceptions.ReactContextLost()
    val packageManager = reactContext.packageManager
    val recipes = collectDiagnosticRecipes()
    recipes.forEach { recipe ->
      Log.i(
        TAG,
        "[${recipe["label"]}] requested=${recipe["requestedAlgorithm"]} alg=${recipe["generatedKeyAlgorithm"]} publicAlg=${recipe["publicKeyAlgorithm"]} spki=${recipe["publicKeyEncodedBytes"]}b [${recipe["publicKeySpkiPrefix"]}...] ed25519=${recipe["publicKeyLooksEd25519"]} signVerify=${recipe["signVerifyOk"]} sigBytes=${recipe["signatureBytes"]} secLevel=${recipe["securityLevelLabel"]} hardware=${recipe["hardwareBacked"]} error=${recipe["errorClass"]}:${recipe["errorMessage"]}",
      )
    }

    return mapOf(
      "sdkInt" to Build.VERSION.SDK_INT,
      "deviceModel" to Build.MODEL,
      "hasHardwareKeystore" to hasFeature(packageManager, "android.hardware.hardware_keystore"),
      "hasCurve25519HardwareKeystore" to hasFeature(
        packageManager,
        "android.hardware.hardware_keystore",
        HARDWARE_KEYSTORE_CURVE_25519_VERSION,
      ),
      "hasStrongBoxKeystore" to hasFeature(packageManager, PackageManager.FEATURE_STRONGBOX_KEYSTORE),
      "hardwareEd25519Supported" to recipes.any(::isSupportedEd25519Recipe),
      "recipes" to recipes,
    )
  }

  private fun hasFeature(packageManager: PackageManager, feature: String, version: Int? = null): Boolean {
    return try {
      if (version != null) packageManager.hasSystemFeature(feature, version)
      else packageManager.hasSystemFeature(feature)
    } catch (_: Exception) {
      false
    }
  }

  private fun collectDiagnosticRecipes(): List<Map<String, Any?>> {
    return listOf(
      diagnosticRecipe("R1-Ed25519-sign", ED25519, null, KeyProperties.PURPOSE_SIGN, signatureAlgorithm = ED25519),
      diagnosticRecipe("R2-Ed25519-sign-verify", ED25519, null, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY, signatureAlgorithm = ED25519),
      diagnosticRecipe("R3-EC-ed25519lower", "EC", ECGenParameterSpec("ed25519"), KeyProperties.PURPOSE_SIGN, signatureAlgorithm = ED25519),
      diagnosticRecipe("R4-EC-Ed25519upper", "EC", ECGenParameterSpec("Ed25519"), KeyProperties.PURPOSE_SIGN, signatureAlgorithm = ED25519),
      diagnosticRecipe("R5-Ed25519-no-sb", ED25519, null, KeyProperties.PURPOSE_SIGN, strongBoxBacked = false, signatureAlgorithm = ED25519),
      diagnosticRecipe("R6-Ed25519-sb", ED25519, null, KeyProperties.PURPOSE_SIGN, strongBoxBacked = true, signatureAlgorithm = ED25519),
      diagnosticRecipe(
        "R7-Ed25519-digest-none",
        ED25519,
        null,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        digests = arrayOf(KeyProperties.DIGEST_NONE),
        signatureAlgorithm = ED25519,
      ),
      // Control group: hardware P-256 proves the keystore hardware path works for EC.
      diagnosticRecipe(
        "R8-EC-p256",
        "EC",
        ECGenParameterSpec("secp256r1"),
        KeyProperties.PURPOSE_SIGN,
        digests = arrayOf(KeyProperties.DIGEST_SHA256),
        signatureAlgorithm = "SHA256withECDSA",
      ),
      diagnosticRecipe(
        "R9-EC-p256-sb",
        "EC",
        ECGenParameterSpec("secp256r1"),
        KeyProperties.PURPOSE_SIGN,
        strongBoxBacked = true,
        digests = arrayOf(KeyProperties.DIGEST_SHA256),
        signatureAlgorithm = "SHA256withECDSA",
      ),
      diagnosticRecipe(
        "R10-CTS-EC-ed25519-default",
        "EC",
        ECGenParameterSpec("ed25519"),
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        digests = arrayOf(KeyProperties.DIGEST_NONE),
        signatureAlgorithm = ED25519,
      ),
      diagnosticRecipe(
        "R11-CTS-EC-ed25519-sb",
        "EC",
        ECGenParameterSpec("ed25519"),
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        strongBoxBacked = true,
        digests = arrayOf(KeyProperties.DIGEST_NONE),
        signatureAlgorithm = ED25519,
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
    signatureAlgorithm: String,
  ): Map<String, Any?> {
    val alias = "wallet_diag_${label.take(20)}_${UUID.randomUUID()}"
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

      result["generatedKeyAlgorithm"] = privKey?.algorithm
      result["publicKeyAlgorithm"] = pubKey?.algorithm
      result["publicKeyFormat"] = pubKey?.format
      result["publicKeyEncodedBytes"] = spki.size
      result["publicKeySpkiPrefix"] = spki.take(8).joinToString("") { "%02x".format(it) }
      result["publicKeyLooksEd25519"] = pubKey?.let { looksLikeEd25519PublicKey(it) } ?: false
      val signatureProbe = if (privKey != null && pubKey != null) {
        probeSignature(privKey, pubKey, signatureAlgorithm)
      } else {
        SignatureProbeResult(verified = false, signatureBytes = 0)
      }

      result["signVerifyOk"] = signatureProbe.verified
      result["signatureBytes"] = signatureProbe.signatureBytes
      result["keyInfoAlgorithm"] = keyInfoResult?.second
      result["securityLevel"] = securityLevel
      result["securityLevelLabel"] = securityLevelLabel(securityLevel)
      result["hardwareBacked"] = isHardwareBackedSecurityLevel(securityLevel)
    } catch (e: Exception) {
      result["errorClass"] = e.javaClass.simpleName
      result["errorMessage"] = e.message
    } finally {
      try {
        KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(alias)
      } catch (_: Exception) {
      }
    }
    return result
  }

  private fun isSupportedEd25519Recipe(recipe: Map<String, Any?>): Boolean {
    return recipe["publicKeyLooksEd25519"] == true &&
      recipe["signVerifyOk"] == true &&
      recipe["hardwareBacked"] == true
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

  private fun probeSignature(
    privateKey: PrivateKey,
    publicKey: PublicKey,
    signatureAlgorithm: String,
  ): SignatureProbeResult {
    return try {
      val message = "wallet-keystore-diagnostic".toByteArray(Charsets.UTF_8)
      val signatureBytes = Signature.getInstance(signatureAlgorithm).apply {
        initSign(privateKey)
        update(message)
      }.sign()
      val verified = Signature.getInstance(signatureAlgorithm).apply {
        initVerify(publicKey)
        update(message)
      }.verify(signatureBytes)
      SignatureProbeResult(verified = verified, signatureBytes = signatureBytes.size)
    } catch (_: Exception) {
      SignatureProbeResult(verified = false, signatureBytes = 0)
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
}
