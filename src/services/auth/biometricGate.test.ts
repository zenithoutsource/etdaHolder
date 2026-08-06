import { confirmBiometricGate, isBiometricGateCancellation } from './biometricGate'

const mockHasHardwareAsync = jest.fn()
const mockIsEnrolledAsync = jest.fn()
const mockAuthenticateAsync = jest.fn()
const mockLogWalletStep = jest.fn()
const mockLogWalletError = jest.fn()

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolledAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
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
    mockHasHardwareAsync.mockReset()
    mockIsEnrolledAsync.mockReset()
    mockAuthenticateAsync.mockReset()
    mockLogWalletStep.mockReset()
    mockLogWalletError.mockReset()
    mockHasHardwareAsync.mockResolvedValue(true)
    mockIsEnrolledAsync.mockResolvedValue(true)
    mockAuthenticateAsync.mockResolvedValue({ success: true })
  })

  test('uses expo-local-authentication for biometric approval', async () => {
    await confirmBiometricGate(gateOptions)

    expect(mockAuthenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Confirm',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
    })
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-complete', {
      authenticator: 'expo-local-authentication',
    })
  })

  test('skips the fallback prompt entirely when allowFallback is false', async () => {
    await confirmBiometricGate({ ...gateOptions, allowFallback: false })

    expect(mockHasHardwareAsync).not.toHaveBeenCalled()
    expect(mockAuthenticateAsync).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-skipped')
  })

  test('throws a scoped cancellation error and skips logWalletError when the fallback prompt is dismissed', async () => {
    mockAuthenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' })

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow('TestGateCancelled')

    expect(isBiometricGateCancellation(new Error('TestGateCancelled'), 'TestGate')).toBe(true)
    expect(mockLogWalletError).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('test-scope', 'biometric-cancelled')
  })

  test('throws a scoped unavailable error when no biometric is enrolled', async () => {
    mockIsEnrolledAsync.mockResolvedValueOnce(false)

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow(
      'TestGateUnavailable: not-enrolled',
    )
  })

  test('throws a scoped unavailable error when hardware is missing', async () => {
    mockHasHardwareAsync.mockResolvedValueOnce(false)

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow(
      'TestGateUnavailable: no-hardware',
    )
    expect(mockIsEnrolledAsync).not.toHaveBeenCalled()
  })

  test('throws a scoped failure for non-cancellation prompt errors', async () => {
    mockAuthenticateAsync.mockResolvedValueOnce({ success: false, error: 'lockout' })

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow('TestGateFailed: lockout')
    expect(mockLogWalletError).toHaveBeenCalled()
  })

  test('logs and wraps unexpected failures with the scoped error prefix', async () => {
    mockAuthenticateAsync.mockRejectedValueOnce(new Error('native biometric failed'))

    await expect(confirmBiometricGate(gateOptions)).rejects.toThrow('TestGateFailed')

    expect(mockLogWalletError).toHaveBeenCalledWith(
      'test-scope',
      'biometric-failed',
      expect.objectContaining({ message: 'native biometric failed' }),
    )
  })
})
