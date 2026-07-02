import ReactNativeBiometrics from 'react-native-biometrics'

import { authenticateWeakBiometric, isNativeWeakBiometricAvailable } from '../crypto/nativeEddsaSigner'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type BiometricGateOptions = {
  promptMessage: string
  cancelButtonText: string
  logScope: string
  errorPrefix: string
  /**
   * When the Android native weak-biometric module is unavailable, fall back to
   * `react-native-biometrics` (BIOMETRIC_STRONG-only on Android). Set false for
   * callers that must not prompt at all when the native module is absent.
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

    logWalletStep(logScope, 'biometric-rn-fallback-start')
    const biometrics = new ReactNativeBiometrics({ allowDeviceCredentials: false })
    const sensor = await biometrics.isSensorAvailable()
    logWalletStep(logScope, 'biometric-sensor-available', {
      biometryType: sensor.biometryType,
    })
    if (!sensor.available) {
      throw new Error(`${errorPrefix}Unavailable${sensor.error ? `: ${sensor.error}` : ''}`)
    }

    const { success } = await biometrics.simplePrompt({
      promptMessage,
      cancelButtonText,
    })

    if (!success) {
      throw new Error(`${errorPrefix}Cancelled`)
    }

    logWalletStep(logScope, 'biometric-complete', {
      authenticator: 'react-native-biometrics',
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
