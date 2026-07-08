import { confirmWalletUnlockBiometric, isWalletUnlockBiometricCancellation } from './walletUnlockBiometric'

const mockHasHardwareAsync = jest.fn()
const mockIsEnrolledAsync = jest.fn()
const mockAuthenticateAsync = jest.fn()
const mockIsNativeWeakBiometricAvailable = jest.fn()
const mockAuthenticateWeakBiometric = jest.fn()
const mockLogWalletStep = jest.fn()
const mockLogWalletError = jest.fn()

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolledAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
}))

jest.mock('../crypto/nativeEddsaSigner', () => ({
  authenticateWeakBiometric: (...args: unknown[]) => mockAuthenticateWeakBiometric(...args),
  isNativeWeakBiometricAvailable: () => mockIsNativeWeakBiometricAvailable(),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletError: (...args: unknown[]) => mockLogWalletError(...args),
  logWalletStep: (...args: unknown[]) => mockLogWalletStep(...args),
}))

describe('wallet unlock biometric approval', () => {
  beforeEach(() => {
    mockHasHardwareAsync.mockReset()
    mockIsEnrolledAsync.mockReset()
    mockAuthenticateAsync.mockReset()
    mockIsNativeWeakBiometricAvailable.mockReset()
    mockAuthenticateWeakBiometric.mockReset()
    mockLogWalletStep.mockReset()
    mockLogWalletError.mockReset()
    mockHasHardwareAsync.mockResolvedValue(true)
    mockIsEnrolledAsync.mockResolvedValue(true)
    mockAuthenticateAsync.mockResolvedValue({ success: true })
    mockIsNativeWeakBiometricAvailable.mockReturnValue(false)
    mockAuthenticateWeakBiometric.mockResolvedValue(true)
  })

  test('treats OS prompt cancellation as a normal cancelled unlock', async () => {
    mockAuthenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' })

    await expect(confirmWalletUnlockBiometric()).rejects.toThrow('WalletUnlockBiometricCancelled')

    expect(isWalletUnlockBiometricCancellation(new Error('WalletUnlockBiometricCancelled'))).toBe(true)
    expect(mockLogWalletError).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('wallet-unlock', 'biometric-cancelled')
  })

  test('logs real biometric failures as errors', async () => {
    mockAuthenticateAsync.mockRejectedValueOnce(new Error('native biometric failed'))

    await expect(confirmWalletUnlockBiometric()).rejects.toThrow('WalletUnlockBiometricFailed')

    expect(mockLogWalletError).toHaveBeenCalledWith(
      'wallet-unlock',
      'biometric-failed',
      expect.objectContaining({ message: 'native biometric failed' }),
    )
  })
})
