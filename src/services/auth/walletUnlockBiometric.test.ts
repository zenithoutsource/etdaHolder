import { confirmWalletUnlockBiometric, isWalletUnlockBiometricCancellation } from './walletUnlockBiometric'

const mockConstructorOptions: unknown[] = []
const mockIsSensorAvailable = jest.fn()
const mockSimplePrompt = jest.fn()
const mockIsNativeWeakBiometricAvailable = jest.fn()
const mockAuthenticateWeakBiometric = jest.fn()
const mockLogWalletStep = jest.fn()
const mockLogWalletError = jest.fn()

jest.mock('react-native-biometrics', () => {
  return jest.fn().mockImplementation((options: unknown) => {
    mockConstructorOptions.push(options)
    return {
      isSensorAvailable: mockIsSensorAvailable,
      simplePrompt: mockSimplePrompt,
    }
  })
})

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
    mockConstructorOptions.length = 0
    mockIsSensorAvailable.mockReset()
    mockSimplePrompt.mockReset()
    mockIsNativeWeakBiometricAvailable.mockReset()
    mockAuthenticateWeakBiometric.mockReset()
    mockLogWalletStep.mockReset()
    mockLogWalletError.mockReset()
    mockIsSensorAvailable.mockResolvedValue({ available: true, biometryType: 'Biometrics' })
    mockSimplePrompt.mockResolvedValue({ success: true })
    mockIsNativeWeakBiometricAvailable.mockReturnValue(false)
    mockAuthenticateWeakBiometric.mockResolvedValue(true)
  })

  test('treats OS prompt cancellation as a normal cancelled unlock', async () => {
    mockSimplePrompt.mockResolvedValueOnce({ success: false })

    await expect(confirmWalletUnlockBiometric()).rejects.toThrow('WalletUnlockBiometricCancelled')

    expect(isWalletUnlockBiometricCancellation(new Error('WalletUnlockBiometricCancelled'))).toBe(true)
    expect(mockLogWalletError).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('wallet-unlock', 'biometric-cancelled')
  })

  test('logs real biometric failures as errors', async () => {
    mockSimplePrompt.mockRejectedValueOnce(new Error('native biometric failed'))

    await expect(confirmWalletUnlockBiometric()).rejects.toThrow('WalletUnlockBiometricFailed')

    expect(mockLogWalletError).toHaveBeenCalledWith(
      'wallet-unlock',
      'biometric-failed',
      expect.objectContaining({ message: 'native biometric failed' }),
    )
  })
})
