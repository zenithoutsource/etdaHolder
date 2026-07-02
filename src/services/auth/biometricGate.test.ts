import { confirmBiometricGate, isBiometricGateCancellation } from './biometricGate'

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

const gateOptions = {
  promptMessage: 'Confirm',
  cancelButtonText: 'Cancel',
  logScope: 'test-scope',
  errorPrefix: 'TestGate',
}

describe('biometricGate', () => {
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

  test('uses the Android native weak biometric prompt when available', async () => {
    mockIsNativeWeakBiometricAvailable.mockReturnValueOnce(true)

    await confirmBiometricGate(gateOptions)

    expect(mockAuthenticateWeakBiometric).toHaveBeenCalledWith('Confirm', 'Cancel')
    expect(mockConstructorOptions).toEqual([])
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-complete', {
      authenticator: 'android-native-biometric-weak',
    })
  })

  test('falls back to react-native-biometrics when the native module is unavailable (iOS path)', async () => {
    await confirmBiometricGate(gateOptions)

    expect(mockConstructorOptions).toEqual([{ allowDeviceCredentials: false }])
    expect(mockSimplePrompt).toHaveBeenCalledWith({ promptMessage: 'Confirm', cancelButtonText: 'Cancel' })
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-complete', {
      authenticator: 'react-native-biometrics',
    })
  })

  test('skips the fallback prompt entirely when allowFallback is false', async () => {
    await confirmBiometricGate({ ...gateOptions, allowFallback: false })

    expect(mockConstructorOptions).toEqual([])
    expect(mockIsSensorAvailable).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-native-unavailable-skip')
  })

  test('throws a scoped cancellation error and skips logWalletError when the fallback prompt is dismissed', async () => {
    mockSimplePrompt.mockResolvedValueOnce({ success: false })

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow('TestGateCancelled')

    expect(isBiometricGateCancellation(new Error('TestGateCancelled'), 'TestGate')).toBe(true)
    expect(mockLogWalletError).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-cancelled')
  })

  test('throws a scoped unavailable error when no sensor is enrolled', async () => {
    mockIsSensorAvailable.mockResolvedValueOnce({ available: false, error: 'BIOMETRIC_ERROR_NONE_ENROLLED' })

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow(
      'TestGateUnavailable: BIOMETRIC_ERROR_NONE_ENROLLED',
    )
  })

  test('logs and wraps unexpected failures with the scoped error prefix', async () => {
    mockSimplePrompt.mockRejectedValueOnce(new Error('native biometric failed'))

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow('TestGateFailed')

    expect(mockLogWalletError).toHaveBeenCalledWith(
      'test-scope',
      'biometric-failed',
      expect.objectContaining({ message: 'native biometric failed' }),
    )
  })
})
