import {
  confirmCredentialDeletionBiometric,
  isCredentialDeletionBiometricCancellation,
} from './credentialDeletionBiometric'

const mockConfirmBiometricGate = jest.fn()
const mockIsBiometricGateCancellation = jest.fn()

jest.mock('../auth/biometricGate', () => ({
  confirmBiometricGate: (...args: unknown[]) => mockConfirmBiometricGate(...args),
  isBiometricGateCancellation: (...args: unknown[]) =>
    mockIsBiometricGateCancellation(...args),
}))

describe('credential deletion biometric approval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfirmBiometricGate.mockResolvedValue(undefined)
  })

  test('uses the shared biometric gate with deletion-specific diagnostics', async () => {
    await confirmCredentialDeletionBiometric()

    expect(mockConfirmBiometricGate).toHaveBeenCalledWith({
      promptMessage: 'ยืนยันตัวตนเพื่อลบเอกสาร',
      cancelButtonText: 'ยกเลิก',
      logScope: 'credential-delete',
      errorPrefix: 'CredentialDeletionBiometric',
    })
  })

  test('classifies cancellation with the deletion error prefix', () => {
    const error = new Error('CredentialDeletionBiometricCancelled')
    mockIsBiometricGateCancellation.mockReturnValueOnce(true)

    expect(isCredentialDeletionBiometricCancellation(error)).toBe(true)
    expect(mockIsBiometricGateCancellation).toHaveBeenCalledWith(
      error,
      'CredentialDeletionBiometric',
    )
  })
})
