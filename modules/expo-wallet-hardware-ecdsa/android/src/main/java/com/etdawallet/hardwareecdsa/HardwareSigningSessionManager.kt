package com.etdawallet.hardwareecdsa

import android.security.keystore.UserNotAuthenticatedException
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.Signature
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

internal data class NativeSigningSession(
  val alias: String,
  val purpose: String,
  val maxSignatures: Int,
  val expiresAtMs: Long,
  var signaturesUsed: Int = 0,
  var closed: Boolean = false,
)

internal object HardwareSigningSessionManager {
  private val sessions = ConcurrentHashMap<String, NativeSigningSession>()
  private val sessionCounter = AtomicLong(0)

  fun openSession(
    alias: String,
    purpose: String,
    maxSignatures: Int,
    expiresAtMs: Long,
  ): String {
    if (!AndroidKeyStoreProbe.hasKey(alias)) {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaKeyNotFound", "KeyNotFound:$alias")
    }

    val handle = "native-session-${sessionCounter.incrementAndGet()}"
    sessions[handle] =
      NativeSigningSession(
        alias = alias,
        purpose = purpose,
        maxSignatures = maxSignatures.coerceAtLeast(1),
        expiresAtMs = expiresAtMs,
      )
    return handle
  }

  suspend fun sign(
    handle: String,
    data: ByteArray,
    activity: FragmentActivity,
  ): SignNativeResult {
    val session =
      sessions[handle]
        ?: throw WalletHardwareEcdsaException("WalletHardwareEcdsaSessionClosed", "SigningSessionClosed")

    if (session.closed) {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaSessionClosed", "SigningSessionClosed")
    }
    if (System.currentTimeMillis() > session.expiresAtMs) {
      throw WalletHardwareEcdsaException("WalletHardwareEcdsaSessionExpired", "SigningSessionExpired")
    }
    if (session.signaturesUsed >= session.maxSignatures) {
      throw WalletHardwareEcdsaException(
        "WalletHardwareEcdsaSessionMaxSignaturesExceeded",
        "SigningSessionMaxSignaturesExceeded",
      )
    }

    var signPath = "auth-valid-no-prompt"
    var userAuthPromptShown = false
    var authRetryTrigger: String? = null

    val derSignature =
      if (session.signaturesUsed == 0) {
        // Every new claim/presentation action opens a new session. Sequence diagrams
        // (P2/P4 WSCA consent + one sign-time gate) require a visible biometric/PIN
        // for that action — do not silently reuse a recent device-unlock window.
        userAuthPromptShown = true
        signPath = "biometric-consent-first-sign"
        authenticateThenSign(session.alias, data, activity)
      } else {
        try {
          signWithoutPrompt(session.alias, data)
        } catch (error: Throwable) {
          if (needsUserAuthentication(error)) {
            authRetryTrigger = error::class.java.simpleName
            userAuthPromptShown = true
            signPath = "biometric-consent-retry"
            authenticateThenSign(session.alias, data, activity)
          } else {
            throw error
          }
        }
      }

    session.signaturesUsed += 1
    return SignNativeResult(
      signature = EcP256Encoding.derEcdsaSignatureToJoseRaw(derSignature),
      signPath = signPath,
      userAuthPromptShown = userAuthPromptShown,
      authRetryTrigger = authRetryTrigger,
      dataBytes = data.size,
      signaturesUsed = session.signaturesUsed,
      maxSignatures = session.maxSignatures,
    )
  }

  private fun needsUserAuthentication(error: Throwable): Boolean {
    var current: Throwable? = error
    while (current != null) {
      if (current is UserNotAuthenticatedException) return true
      val message = current.message?.lowercase().orEmpty()
      if (
        message.contains("user not authenticated") ||
        message.contains("key user not authenticated") ||
        message.contains("crypto primitive not initialized")
      ) {
        return true
      }
      current = current.cause
    }
    return false
  }

  fun closeSession(handle: String) {
    sessions.remove(handle)?.closed = true
  }

  fun invalidateAliasSessions(alias: String) {
    sessions.entries.removeIf { (_, session) ->
      if (session.alias == alias) {
        session.closed = true
        true
      } else {
        false
      }
    }
  }

  private fun signWithoutPrompt(alias: String, data: ByteArray): ByteArray {
    val entry = AndroidKeyStoreProbe.loadPrivateKeyEntry(alias)
    val signature = Signature.getInstance("SHA256withECDSA")
    signature.initSign(entry.privateKey)
    signature.update(data)
    return signature.sign()
  }

  /**
   * Keys use non-zero auth validity (action-scoped multi-sign). Authenticate with
   * BiometricPrompt **without** CryptoObject (allows BIOMETRIC_STRONG | DEVICE_CREDENTIAL),
   * then sign. Always shows an in-app prompt for the user action.
   */
  private suspend fun authenticateThenSign(
    alias: String,
    data: ByteArray,
    activity: FragmentActivity,
  ): ByteArray {
    if (activity.isFinishing || activity.isDestroyed) {
      throw WalletHardwareEcdsaException(
        "WalletHardwareEcdsaActivityUnavailable",
        "ActivityNotReadyForBiometricPrompt",
      )
    }

    authenticateUser(activity)
    return signWithoutPrompt(alias, data)
  }

  private suspend fun authenticateUser(activity: FragmentActivity) {
    suspendCancellableCoroutine { continuation ->
      val executor = ContextCompat.getMainExecutor(activity)
      val prompt =
        BiometricPrompt(
          activity,
          executor,
          object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
              if (continuation.isActive) {
                continuation.resumeWithException(mapAuthenticationError(errorCode, errString))
              }
            }

            override fun onAuthenticationFailed() {
              // Allow another attempt.
            }

            override fun onAuthenticationSucceeded(
              @Suppress("UNUSED_PARAMETER") result: BiometricPrompt.AuthenticationResult,
            ) {
              if (continuation.isActive) {
                continuation.resume(Unit)
              }
            }
          },
        )

      // No CryptoObject → DEVICE_CREDENTIAL is allowed; do not setNegativeButtonText.
      val promptInfo =
        BiometricPrompt.PromptInfo.Builder()
          .setTitle("Authenticate to sign")
          .setSubtitle("Confirm to use your wallet signing key")
          .setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or
              BiometricManager.Authenticators.DEVICE_CREDENTIAL,
          )
          .build()

      try {
        prompt.authenticate(promptInfo)
      } catch (error: Throwable) {
        if (continuation.isActive) {
          continuation.resumeWithException(
            WalletHardwareEcdsaException(
              "WalletHardwareEcdsaSigningFailed",
              error.message ?: "BiometricPromptStartFailed",
              error,
            ),
          )
        }
      }
    }
  }

  private fun mapAuthenticationError(errorCode: Int, errString: CharSequence): WalletHardwareEcdsaException {
    if (
      errorCode == BiometricPrompt.ERROR_CANCELED ||
      errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
      errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
    ) {
      return WalletHardwareEcdsaException(
        "WalletHardwareEcdsaSigningCancelled",
        "BiometricAuthenticationCancelled:$errorCode",
      )
    }

    return WalletHardwareEcdsaException(
      "WalletHardwareEcdsaSigningFailed",
      "BiometricAuthenticationFailed:$errString",
    )
  }
}

internal data class SignNativeResult(
  val signature: ByteArray,
  val signPath: String,
  val userAuthPromptShown: Boolean,
  val authRetryTrigger: String?,
  val dataBytes: Int,
  val signaturesUsed: Int,
  val maxSignatures: Int,
)
