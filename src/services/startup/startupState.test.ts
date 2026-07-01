import {
  readPrepareWalletStartState,
  readStorageBiometricReadyState,
  readStoragePinForgotPinMode,
  readStoragePinUnlockFailureState,
  readStoragePinUnlockMode,
  readStorageUnlockCancelledState,
  resolveStoragePinUnlockError,
  type RootStartupState,
} from './startupState'

describe('startup state transitions', () => {
  test('keeps the PIN screen mounted when retrying biometric from the startup PIN surface', () => {
    const currentState: RootStartupState = {
      status: 'storage-pin-required',
      fallbackAvailable: true,
      pinUnlockEnabled: true,
      mode: 'unlock',
      isSubmitting: false,
    }

    expect(readPrepareWalletStartState(currentState, { platform: 'android' })).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: true,
      pinUnlockEnabled: true,
      mode: 'unlock',
      isSubmitting: true,
    })
  })

  test('uses loading for native cold start before biometric is ready', () => {
    expect(readPrepareWalletStartState({ status: 'loading' }, { platform: 'android' })).toEqual({
      status: 'loading',
    })
  })

  test('uses the submitting PIN screen for PIN storage unlock attempts', () => {
    expect(
      readPrepareWalletStartState(
        { status: 'loading' },
        { platform: 'android', storagePin: '123456', fallbackAvailable: true, pinUnlockEnabled: true },
      ),
    ).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: true,
      pinUnlockEnabled: true,
      mode: 'unlock',
      isSubmitting: true,
    })
  })

  test('keeps PIN fallback available when biometric storage unlock is ready', () => {
    expect(readStorageBiometricReadyState(true, false)).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: true,
      pinUnlockEnabled: false,
      mode: 'unlock',
      isSubmitting: true,
    })
  })

  test('maps unavailable PIN fallback to a biometric-only message', () => {
    expect(readStoragePinUnlockFailureState('StoragePinFallbackUnavailable', false, false)).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: false,
      pinUnlockEnabled: false,
      mode: 'unlock',
      isSubmitting: false,
      error: 'ไม่สามารถปลดล็อกด้วย PIN ได้ กรุณาใช้สแกนใบหน้าหรือลายนิ้วมือ',
    })
  })

  test('maps wrong PIN verifier mismatch to an incorrect PIN message', () => {
    expect(resolveStoragePinUnlockError('StoragePinVerifierMismatch')).toBe(
      'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
    )
  })

  test('maps correct PIN without storage fallback to a biometric-required message', () => {
    expect(resolveStoragePinUnlockError('StoragePinFallbackRequired')).toBe(
      'กรุณาใช้สแกนใบหน้าหรือลายนิ้วมือเพื่อปลดล็อก',
    )
  })

  test('switches storage pin required mode to forgot-pin', () => {
    const currentState: RootStartupState = {
      status: 'storage-pin-required',
      fallbackAvailable: false,
      pinUnlockEnabled: false,
      mode: 'unlock',
      isSubmitting: false,
      error: 'old error',
    }

    expect(readStoragePinForgotPinMode(currentState)).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: false,
      pinUnlockEnabled: false,
      mode: 'forgot-pin',
      isSubmitting: false,
    })
  })

  test('returns storage pin required mode to unlock', () => {
    const currentState: RootStartupState = {
      status: 'storage-pin-required',
      fallbackAvailable: false,
      pinUnlockEnabled: false,
      mode: 'forgot-pin',
      isSubmitting: false,
    }

    expect(readStoragePinUnlockMode(currentState)).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: false,
      pinUnlockEnabled: false,
      mode: 'unlock',
      isSubmitting: false,
    })
  })

  test('maps storage unlock cancelled to biometric-first startup state', () => {
    expect(readStorageUnlockCancelledState(false, false)).toEqual({
      status: 'storage-pin-required',
      fallbackAvailable: false,
      pinUnlockEnabled: false,
      mode: 'unlock',
      isSubmitting: false,
    })
  })
})
