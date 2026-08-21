import {
  confirmCredentialRevokeBiometric,
  isCredentialRevokeBiometricCancellation,
} from './credentialRevokeBiometric'

const mockConfirmBiometricGate = jest.fn()
const mockIsBiometricGateCancellation = jest.fn()

jest.mock('../auth/biometricGate', () => ({
  confirmBiometricGate: (...args: unknown[]) => mockConfirmBiometricGate(...args),
  isBiometricGateCancellation: (...args: unknown[]) =>
    mockIsBiometricGateCancellation(...args),
}))

describe('credential revoke biometric approval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfirmBiometricGate.mockResolvedValue(undefined)
  })

  test('uses the shared biometric gate with revoke-specific diagnostics', async () => {
    await confirmCredentialRevokeBiometric()

    expect(mockConfirmBiometricGate).toHaveBeenCalledWith({
      promptMessage: 'ยืนยันตัวตนเพื่อระงับเอกสาร',
      cancelButtonText: 'ยกเลิก',
      logScope: 'credential-revoke',
      errorPrefix: 'CredentialRevokeBiometric',
    })
  })

  test('classifies cancellation with the revoke error prefix', () => {
    const error = new Error('CredentialRevokeBiometricCancelled')
    mockIsBiometricGateCancellation.mockReturnValueOnce(true)

    expect(isCredentialRevokeBiometricCancellation(error)).toBe(true)
    expect(mockIsBiometricGateCancellation).toHaveBeenCalledWith(
      error,
      'CredentialRevokeBiometric',
    )
  })
})
