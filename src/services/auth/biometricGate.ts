import * as LocalAuthentication from 'expo-local-authentication'

import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type BiometricGateOptions = {
  promptMessage: string
  cancelButtonText: string
  logScope: string
  errorPrefix: string
  /**
   * Use `expo-local-authentication` for app-level biometric gates. Set false
   * for callers that must skip a non-signing app-level prompt.
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

    if (!allowFallback) {
      logWalletStep(logScope, 'biometric-skipped')
      return
    }

    logWalletStep(logScope, 'biometric-expo-start')
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
