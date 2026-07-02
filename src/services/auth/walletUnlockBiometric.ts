import { confirmBiometricGate, isBiometricGateCancellation } from './biometricGate'

const unlockPromptMessage = 'ยืนยันตัวตนเพื่อเข้าใช้ Wallet'
const unlockCancelText = 'ยกเลิก'
const errorPrefix = 'WalletUnlockBiometric'

export function isWalletUnlockBiometricCancellation(error: unknown): boolean {
  return isBiometricGateCancellation(error, errorPrefix)
}

export async function confirmWalletUnlockBiometric(): Promise<void> {
  await confirmBiometricGate({
    promptMessage: unlockPromptMessage,
    cancelButtonText: unlockCancelText,
    logScope: 'wallet-unlock',
    errorPrefix,
  })
}
