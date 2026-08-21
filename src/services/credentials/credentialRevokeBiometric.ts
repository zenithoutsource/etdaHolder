import {
  confirmBiometricGate,
  isBiometricGateCancellation,
} from '../auth/biometricGate'

const ERROR_PREFIX = 'CredentialRevokeBiometric'

export function isCredentialRevokeBiometricCancellation(error: unknown): boolean {
  return isBiometricGateCancellation(error, ERROR_PREFIX)
}

export async function confirmCredentialRevokeBiometric(): Promise<void> {
  await confirmBiometricGate({
    promptMessage: 'ยืนยันตัวตนเพื่อระงับเอกสาร',
    cancelButtonText: 'ยกเลิก',
    logScope: 'credential-revoke',
    errorPrefix: ERROR_PREFIX,
  })
}
