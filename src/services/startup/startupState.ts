import type { PlatformOSType } from 'react-native'

export type StoragePinRequiredMode = 'unlock' | 'forgot-pin'

export type RootStartupState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }
  | {
      status: 'storage-pin-migration'
      step: 'biometric' | 'pin'
      isSubmitting?: boolean
      error?: string
    }
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
  overrides: Partial<StoragePinRequiredBase> & Pick<StoragePinRequiredBase, 'fallbackAvailable' | 'pinUnlockEnabled'>,
): Pick<
  Extract<RootStartupState, { status: 'storage-pin-required' }>,
  'fallbackAvailable' | 'pinUnlockEnabled' | 'mode'
> {
  const preserved =
    currentState.status === 'storage-pin-required'
      ? {
          fallbackAvailable: currentState.fallbackAvailable,
          pinUnlockEnabled: currentState.pinUnlockEnabled,
          mode: currentState.mode,
        }
      : {
          fallbackAvailable: overrides.fallbackAvailable,
          pinUnlockEnabled: overrides.pinUnlockEnabled,
          mode: 'unlock' as const,
        }

  return {
    fallbackAvailable: overrides.fallbackAvailable ?? preserved.fallbackAvailable,
    pinUnlockEnabled: overrides.pinUnlockEnabled ?? preserved.pinUnlockEnabled,
    mode: overrides.mode ?? preserved.mode,
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
    return 'หลังอัปเดต ครั้งแรกให้กดปุ่มลายนิ้วมือด้านล่าง ครั้งถัดไปใช้ PIN ได้เลย'
  }
  return 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
}

export function shouldOfferStoragePinRecovery(
  errorMessage: string,
  fallbackAvailable: boolean,
): boolean {
  return fallbackAvailable && errorMessage.startsWith('StorageInitializationFailed:')
}

export function readStartupStorageUnlockCopy(
  fallbackAvailable: boolean,
  pinUnlockEnabled: boolean,
): { title: string; subtitle: string } {
  if (!fallbackAvailable && !pinUnlockEnabled) {
    return {
      title: 'ปลดล็อก Wallet',
      subtitle: 'หลังอัปเดต ครั้งแรกให้กดปุ่มลายนิ้วมือด้านล่าง ครั้งถัดไปใช้ PIN ได้เลย',
    }
  }

  if (!fallbackAvailable) {
    return {
      title: 'ปลดล็อก Wallet',
      subtitle: 'หลังอัปเดต กรุณาสแกนใบหน้าหรือลายนิ้วมือก่อน แล้วยืนยัน PIN ครั้งเดียว',
    }
  }

  return {
    title: 'ปลดล็อก Wallet',
    subtitle: 'โปรดระบุรหัส PIN 6 หลัก หรือใช้สแกนใบหน้า / ลายนิ้วมือ',
  }
}

export function readStoragePinMigrationBiometricState(error?: string): RootStartupState {
  return {
    status: 'storage-pin-migration',
    step: 'biometric',
    isSubmitting: false,
    error,
  }
}

export function readStoragePinMigrationPinState(error?: string): RootStartupState {
  return {
    status: 'storage-pin-migration',
    step: 'pin',
    isSubmitting: false,
    error,
  }
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
      ...readStoragePinRequiredFields(currentState, {
        fallbackAvailable: options.fallbackAvailable ?? currentState.fallbackAvailable,
        pinUnlockEnabled: options.pinUnlockEnabled ?? currentState.pinUnlockEnabled,
      }),
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
