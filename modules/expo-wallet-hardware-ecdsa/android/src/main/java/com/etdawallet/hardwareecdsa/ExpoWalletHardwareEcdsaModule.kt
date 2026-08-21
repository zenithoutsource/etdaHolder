package com.etdawallet.hardwareecdsa

import android.util.Base64
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ExpoWalletHardwareEcdsaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWalletHardwareEcdsa")

    AsyncFunction("hasKey") { alias: String, promise: Promise ->
      try {
        promise.resolve(AndroidKeyStoreProbe.hasKey(alias))
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("getSecurityLevel") { alias: String, promise: Promise ->
      try {
        promise.resolve(AndroidKeyStoreProbe.getSecurityLevel(alias))
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("getPublicJwk") { alias: String, promise: Promise ->
      try {
        promise.resolve(AndroidKeyStoreHardwareEcdsa.readPublicJwk(alias))
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("createKey") { options: Map<String, Any?>, promise: Promise ->
      try {
        val alias = options["alias"] as? String
          ?: throw WalletHardwareEcdsaException("WalletHardwareEcdsaInvalidArgument", "AliasRequired")
        val authValiditySeconds = (options["authValiditySeconds"] as? Number)?.toInt() ?: 30
        val attestationChallenge =
          (options["attestationChallengeBase64"] as? String)
            ?.takeIf { it.isNotEmpty() }
            ?.let { Base64.decode(it, Base64.NO_WRAP) }

        val result =
          AndroidKeyStoreHardwareEcdsa.createKey(
            alias = alias,
            attestationChallenge = attestationChallenge,
            authValiditySeconds = authValiditySeconds,
          )

        val keyStoreCapabilities =
          appContext.reactContext?.applicationContext?.let { context ->
            AndroidKeyStoreProbe.readKeyStoreCapabilities(context)
          } ?: emptyMap<String, Any>()

        promise.resolve(
          mapOf(
            "publicJwk" to result.publicJwk,
            "securityLevel" to result.securityLevel,
            "certificateChainDerBase64" to
              result.certificateChainDer.map {
                Base64.encodeToString(it, Base64.NO_WRAP)
              },
            "diagnostics" to
              mapOf(
                "keyStore" to keyStoreCapabilities,
                "keyCreate" to result.keyCreateDiagnostics,
              ),
          ),
        )
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("deleteKey") { alias: String, promise: Promise ->
      try {
        AndroidKeyStoreHardwareEcdsa.deleteKey(alias)
        HardwareSigningSessionManager.invalidateAliasSessions(alias)
        promise.resolve(null)
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("openSigningSession") { options: Map<String, Any?>, promise: Promise ->
      try {
        val alias = options["alias"] as? String
          ?: throw WalletHardwareEcdsaException("WalletHardwareEcdsaInvalidArgument", "AliasRequired")
        val purpose = options["purpose"] as? String
          ?: throw WalletHardwareEcdsaException("WalletHardwareEcdsaInvalidArgument", "PurposeRequired")
        val maxSignatures = (options["maxSignatures"] as? Number)?.toInt() ?: 1
        val expiresAtMs = (options["expiresAtMs"] as? Number)?.toLong()
          ?: (System.currentTimeMillis() + 30_000L)

        val handle =
          HardwareSigningSessionManager.openSession(
            alias = alias,
            purpose = purpose,
            maxSignatures = maxSignatures,
            expiresAtMs = expiresAtMs,
          )

        promise.resolve(mapOf("opaqueNativeHandle" to handle))
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("signWithSession") { options: Map<String, Any?>, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject(
          "WalletHardwareEcdsaActivityUnavailable",
          "CurrentActivityUnavailable",
          null,
        )
        return@AsyncFunction
      }

      CoroutineScope(Dispatchers.Main.immediate).launch {
        try {
          val handle = options["opaqueNativeHandle"] as? String
            ?: throw WalletHardwareEcdsaException("WalletHardwareEcdsaInvalidArgument", "SessionHandleRequired")
          val data =
            decodeSignedPayload(options["data"])
              ?: throw WalletHardwareEcdsaException("WalletHardwareEcdsaInvalidArgument", "SignDataRequired")

          val result = HardwareSigningSessionManager.sign(handle, data, activity)
          promise.resolve(
            mapOf(
              "signatureBase64" to Base64.encodeToString(result.signature, Base64.NO_WRAP),
              "diagnostics" to
                mapOf(
                  "signPath" to result.signPath,
                  "userAuthPromptShown" to result.userAuthPromptShown,
                  "authRetryTrigger" to result.authRetryTrigger,
                  "dataBytes" to result.dataBytes,
                  "signaturesUsed" to result.signaturesUsed,
                  "maxSignatures" to result.maxSignatures,
                ),
            ),
          )
        } catch (error: Throwable) {
          rejectPromise(promise, error)
        }
      }
    }

    AsyncFunction("closeSigningSession") { handle: String, promise: Promise ->
      try {
        HardwareSigningSessionManager.closeSession(handle)
        promise.resolve(null)
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }

    AsyncFunction("probeStrongBoxKeyMint") { options: Map<String, Any?>?, promise: Promise ->
      try {
        val context =
          appContext.reactContext?.applicationContext
            ?: throw WalletHardwareEcdsaException(
              "WalletHardwareEcdsaContextUnavailable",
              "ApplicationContextUnavailable",
            )
        val authValiditySeconds = (options?.get("authValiditySeconds") as? Number)?.toInt() ?: 30
        promise.resolve(StrongBoxKeyMintProbe.run(context, authValiditySeconds))
      } catch (error: Throwable) {
        rejectPromise(promise, error)
      }
    }
  }

  private fun decodeSignedPayload(raw: Any?): ByteArray? =
    when (raw) {
      is ByteArray -> raw
      is String -> Base64.decode(raw, Base64.DEFAULT)
      else -> null
    }

  private fun rejectPromise(promise: Promise, error: Throwable) {
    when (error) {
      is WalletHardwareEcdsaException -> promise.reject(error.code, error.message, error)
      else -> promise.reject("WalletHardwareEcdsaFailed", error.message, error)
    }
  }
}
