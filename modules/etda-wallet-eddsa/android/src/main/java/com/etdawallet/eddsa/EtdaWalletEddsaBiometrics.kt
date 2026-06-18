package com.etdawallet.eddsa

import android.os.Looper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricPrompt.PromptInfo
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.AppContext
import java.security.Signature

class EtdaWalletEddsaBiometrics(
  private val appContext: AppContext,
  private val signedCb: (sig: ByteArray) -> Unit,
  private val errorCb: (code: Number, message: String) -> Unit,
  private val toBeSigned: ByteArray,
  private val activity: FragmentActivity = appContext.currentActivity as? FragmentActivity
    ?: throw expo.modules.kotlin.exception.CodedException("FragmentActivityRequired: current activity is not a FragmentActivity"),
  private val promptInfo: PromptInfo = PromptInfo
    .Builder()
    .setTitle("Biometrics")
    .setSubtitle("Authenticate to sign data")
    .setNegativeButtonText("Cancel")
    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
    .build(),
) : BiometricPrompt.AuthenticationCallback() {
  override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
    result.cryptoObject?.signature?.let { signature ->
      signature.update(toBeSigned)
      signedCb(signature.sign())
    } ?: errorCb(2323, "No CryptoObjectFound")
  }

  override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
    super.onAuthenticationError(errorCode, errString)
    errorCb(errorCode, errString.toString())
  }

  private fun authenticateWithPrompt(signature: Signature) {
    val prompt = BiometricPrompt(activity, this)
    prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(signature))
  }

  fun authenticate(signature: Signature) {
    if (Thread.currentThread() != Looper.getMainLooper().thread) {
      activity.runOnUiThread { this@EtdaWalletEddsaBiometrics.authenticate(signature) }
      return
    }

    authenticateWithPrompt(signature)
  }
}
