import type { PlatformOSType } from 'react-native'

export const STARTUP_PIN_UNLOCK_DISABLED_MESSAGE =
  'ครั้งแรกหลังอัปเดต กรุณาปลดล็อกด้วยสแกนใบหน้าหรือลายนิ้วมือก่อน จากนั้นจึงใช้ PIN ได้'

export type StoragePinRequiredMode = 'unlock' | 'forgot-pin'

export type RootStartupState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }
  | {
      status: 'storage-pin-required'
      fallbackAvailable: boolean
      pinUnlockEnabled: boolean
      mode: StoragePinRequiredMode
      isSubmitting: boolean
      error?: string
    }

type PrepareWalletStartOptions = {
  platform: PlatformOSType
  storagePin?: string
  fallbackAvailable?: boolean
  pinUnlockEnabled?: boolean
}

type StoragePinRequiredBase = {
  fallbackAvailable: boolean
  pinUnlockEnabled: boolean
  mode?: StoragePinRequiredMode
}

function readStoragePinRequiredFields(
  currentState: RootStartupState,
  overrides: StoragePinRequiredBase,
): Pick<
  Extract<RootStartupState, { status: 'storage-pin-required' }>,
  'fallbackAvailable' | 'pinUnlockEnabled' | 'mode'
> {
  const preservedMode =
    currentState.status === 'storage-pin-required' ? currentState.mode : 'unlock'

  return {
    fallbackAvailable: overrides.fallbackAvailable,
    pinUnlockEnabled: overrides.pinUnlockEnabled,
    mode: overrides.mode ?? preservedMode,
  }
}

export function resolveStoragePinUnlockError(errorMessage: string): string {
  if (errorMessage === 'StoragePinVerifierMismatch' || errorMessage === 'StoragePinUnlockFailed') {
    return 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
  }
  if (errorMessage === 'StoragePinFallbackRequired') {
    return 'กรุณาใช้สแกนใบหน้าหรือลายนิ้วมือเพื่อปลดล็อก'
  }
  if (errorMessage === 'StoragePinFallbackUnavailable') {
    return 'ไม่สามารถปลดล็อกด้วย PIN ได้ กรุณาใช้สแกนใบหน้าหรือลายนิ้วมือ'
  }
  return 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
}

export function readPrepareWalletStartState(
  currentState: RootStartupState,
  options: PrepareWalletStartOptions,
): RootStartupState {
  if (options.platform === 'web') return { status: 'loading' }

  const pinFields = readStoragePinRequiredFields(currentState, {
    fallbackAvailable: options.fallbackAvailable ?? false,
    pinUnlockEnabled: options.pinUnlockEnabled ?? false,
  })

  if (options.storagePin) {
    return {
      status: 'storage-pin-required',
      ...pinFields,
      mode: 'unlock',
      isSubmitting: true,
    }
  }

  if (currentState.status === 'storage-pin-required') {
    return {
      status: 'storage-pin-required',
      ...pinFields,
      isSubmitting: true,
    }
  }

  return { status: 'loading' }
}

export function readStorageBiometricReadyState(
  fallbackAvailable: boolean,
  pinUnlockEnabled: boolean,
): RootStartupState {
  return {
    status: 'storage-pin-required',
    fallbackAvailable,
    pinUnlockEnabled,
    mode: 'unlock',
    isSubmitting: true,
  }
}

export function readStorageUnlockCancelledState(
  fallbackAvailable: boolean,
  pinUnlockEnabled: boolean,
): RootStartupState {
  return {
    status: 'storage-pin-required',
    fallbackAvailable,
    pinUnlockEnabled,
    mode: 'unlock',
    isSubmitting: false,
  }
}

export function readStoragePinUnlockFailureState(
  errorMessage: string,
  fallbackAvailable: boolean,
  pinUnlockEnabled: boolean,
  mode: StoragePinRequiredMode = 'unlock',
): RootStartupState {
  return {
    status: 'storage-pin-required',
    fallbackAvailable,
    pinUnlockEnabled,
    mode,
    isSubmitting: false,
    error: resolveStoragePinUnlockError(errorMessage),
  }
}

export function readStoragePinForgotPinMode(currentState: RootStartupState): RootStartupState {
  if (currentState.status !== 'storage-pin-required') {
    return currentState
  }

  return {
    ...currentState,
    mode: 'forgot-pin',
    error: undefined,
    isSubmitting: false,
  }
}

export function readStoragePinUnlockMode(currentState: RootStartupState): RootStartupState {
  if (currentState.status !== 'storage-pin-required') {
    return currentState
  }

  return {
    ...currentState,
    mode: 'unlock',
    error: undefined,
    isSubmitting: false,
  }
}
