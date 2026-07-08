import * as LocalAuthentication from 'expo-local-authentication'

import { authenticateWeakBiometric, isNativeWeakBiometricAvailable } from '../crypto/nativeEddsaSigner'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type BiometricGateOptions = {
  promptMessage: string
  cancelButtonText: string
  logScope: string
  errorPrefix: string
  /**
   * When the Android native weak-biometric module is unavailable, fall back to
   * `expo-local-authentication` (BIOMETRIC_WEAK on Android, so Class 2 face
   * unlock stays usable; Face ID/Touch ID on iOS). Set false for callers that
   * must not prompt at all when the native module is absent.
   */
  allowFallback?: boolean
}

export function isBiometricGateCancellation(error: unknown, errorPrefix: string): boolean {
  return error instanceof Error && error.message === `${errorPrefix}Cancelled`
}

export async function confirmBiometricGate(options: BiometricGateOptions): Promise<void> {
  const { promptMessage, cancelButtonText, logScope, errorPrefix, allowFallback = true } = options

  try {
    logWalletStep(logScope, 'biometric-start')

    if (isNativeWeakBiometricAvailable()) {
      logWalletStep(logScope, 'biometric-native-weak-start')
      const success = await authenticateWeakBiometric(promptMessage, cancelButtonText)
      if (!success) {
        throw new Error(`${errorPrefix}Cancelled`)
      }

      logWalletStep(logScope, 'biometric-complete', {
        authenticator: 'android-native-biometric-weak',
      })
      return
    }

    if (!allowFallback) {
      logWalletStep(logScope, 'biometric-native-unavailable-skip')
      return
    }

    logWalletStep(logScope, 'biometric-expo-fallback-start')
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    const isEnrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync())
    logWalletStep(logScope, 'biometric-sensor-available', { hasHardware, isEnrolled })
    if (!hasHardware || !isEnrolled) {
      throw new Error(
        `${errorPrefix}Unavailable: ${hasHardware ? 'not-enrolled' : 'no-hardware'}`,
      )
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: cancelButtonText,
      // Biometrics only — no device PIN/pattern fallback. On Android this keeps
      // the prompt at BIOMETRIC_WEAK, so Class 2 face unlock is accepted.
      disableDeviceFallback: true,
    })

    if (!result.success) {
      if (
        result.error === 'user_cancel' ||
        result.error === 'system_cancel' ||
        result.error === 'app_cancel'
      ) {
        throw new Error(`${errorPrefix}Cancelled`)
      }
      throw new Error(`${errorPrefix}Failed: ${result.error}`)
    }

    logWalletStep(logScope, 'biometric-complete', {
      authenticator: 'expo-local-authentication',
    })
  } catch (error) {
    if (isBiometricGateCancellation(error, errorPrefix)) {
      logWalletStep(logScope, 'biometric-cancelled')
      throw error
    }

    logWalletError(logScope, 'biometric-failed', error)
    if (error instanceof Error && error.message.startsWith(errorPrefix)) {
      throw error
    }
    throw new Error(`${errorPrefix}Failed`)
  }
}
