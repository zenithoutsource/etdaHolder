import ReactNativeBiometrics from 'react-native-biometrics'

import {
  authenticateWeakBiometric,
  isNativeWeakBiometricAvailable,
} from '../crypto/nativeEddsaSigner'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

const unlockPromptMessage = 'ยืนยันตัวตนเพื่อเข้าใช้ Wallet'
const unlockCancelText = 'ยกเลิก'

export function isWalletUnlockBiometricCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === 'WalletUnlockBiometricCancelled'
}

export async function confirmWalletUnlockBiometric(): Promise<void> {
  try {
    logWalletStep('wallet-unlock', 'biometric-start')

    if (isNativeWeakBiometricAvailable()) {
      logWalletStep('wallet-unlock', 'biometric-native-weak-start')
      const success = await authenticateWeakBiometric(unlockPromptMessage, unlockCancelText)
      if (!success) {
        throw new Error('WalletUnlockBiometricCancelled')
      }

      logWalletStep('wallet-unlock', 'biometric-complete', {
        authenticator: 'android-native-biometric-weak',
      })
      return
    }

    logWalletStep('wallet-unlock', 'biometric-rn-fallback-start')
    const biometrics = new ReactNativeBiometrics({ allowDeviceCredentials: false })
    const sensor = await biometrics.isSensorAvailable()
    logWalletStep('wallet-unlock', 'biometric-sensor-available', {
      biometryType: sensor.biometryType,
    })
    if (!sensor.available) {
      throw new Error(`WalletUnlockBiometricUnavailable${sensor.error ? `: ${sensor.error}` : ''}`)
    }

    const { success } = await biometrics.simplePrompt({
      promptMessage: unlockPromptMessage,
      cancelButtonText: unlockCancelText,
    })

    if (!success) {
      throw new Error('WalletUnlockBiometricCancelled')
    }

    logWalletStep('wallet-unlock', 'biometric-complete', {
      authenticator: 'react-native-biometrics',
    })
  } catch (error) {
    if (isWalletUnlockBiometricCancellation(error)) {
      logWalletStep('wallet-unlock', 'biometric-cancelled')
      throw error
    }

    logWalletError('wallet-unlock', 'biometric-failed', error)
    if (error instanceof Error && error.message.startsWith('WalletUnlockBiometric')) {
      throw error
    }
    throw new Error('WalletUnlockBiometricFailed')
  }
}
