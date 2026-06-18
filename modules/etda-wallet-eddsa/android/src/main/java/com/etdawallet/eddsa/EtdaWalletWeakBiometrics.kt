package com.etdawallet.eddsa

import android.os.Looper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricPrompt.PromptInfo
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.exception.CodedException

class EtdaWalletWeakBiometrics(
  private val appContext: AppContext,
  private val promptMessage: String,
  private val cancelButtonText: String,
  private val successCb: () -> Unit,
  private val cancelCb: () -> Unit,
  private val errorCb: (code: Number, message: String) -> Unit,
) : BiometricPrompt.AuthenticationCallback() {
  private val activity: FragmentActivity
    get() = appContext.currentActivity as? FragmentActivity
      ?: throw CodedException("WeakBiometricActivityUnavailable: current activity is not a FragmentActivity")

  private val promptInfo: PromptInfo
    get() = PromptInfo
      .Builder()
      .setTitle(promptMessage.ifBlank { "Biometrics" })
      .setNegativeButtonText(cancelButtonText.ifBlank { "Cancel" })
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
      .build()

  override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
    successCb()
  }

  override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
    super.onAuthenticationError(errorCode, errString)
    when (errorCode) {
      BiometricPrompt.ERROR_CANCELED,
      BiometricPrompt.ERROR_NEGATIVE_BUTTON,
      BiometricPrompt.ERROR_USER_CANCELED -> cancelCb()
      else -> errorCb(errorCode, errString.toString())
    }
  }

  fun authenticate() {
    val currentActivity = activity
    if (Thread.currentThread() != Looper.getMainLooper().thread) {
      currentActivity.runOnUiThread { this@EtdaWalletWeakBiometrics.authenticate() }
      return
    }

    val authStatus = BiometricManager
      .from(currentActivity)
      .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
    if (authStatus != BiometricManager.BIOMETRIC_SUCCESS) {
      errorCb(authStatus, "Weak biometric authentication is unavailable")
      return
    }

    BiometricPrompt(currentActivity, this).authenticate(promptInfo)
  }
}
