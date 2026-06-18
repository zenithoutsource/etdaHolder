import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getNativeEd25519Diagnostics } from './nativeEddsaSigner'

export function runNativeEd25519Diagnostics(isDevelopment = __DEV__): void {
  if (!isDevelopment) return

  try {
    logWalletStep('native-eddsa', 'diagnostics', getNativeEd25519Diagnostics())
  } catch (error) {
    logWalletError('native-eddsa', 'diagnostics-failed', error)
  }
}
