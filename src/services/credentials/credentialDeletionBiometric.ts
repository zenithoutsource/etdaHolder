import {
  confirmBiometricGate,
  isBiometricGateCancellation,
} from '../auth/biometricGate'

const ERROR_PREFIX = 'CredentialDeletionBiometric'

export function isCredentialDeletionBiometricCancellation(error: unknown): boolean {
  return isBiometricGateCancellation(error, ERROR_PREFIX)
}

export async function confirmCredentialDeletionBiometric(): Promise<void> {
  await confirmBiometricGate({
    promptMessage: 'ยืนยันตัวตนเพื่อลบเอกสาร',
    cancelButtonText: 'ยกเลิก',
    logScope: 'credential-delete',
    errorPrefix: ERROR_PREFIX,
  })
}
