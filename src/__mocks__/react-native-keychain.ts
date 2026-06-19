const ACCESS_CONTROL = {
  BIOMETRY_ANY: 'BiometryAny',
  BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BiometryAnyOrDevicePasscode',
  BIOMETRY_CURRENT_SET: 'BiometryCurrentSet',
  DEVICE_PASSCODE: 'DevicePasscode',
  USER_PRESENCE: 'UserPresence',
}

const ACCESSIBLE = {
  WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
  AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'AccessibleWhenPasscodeSetThisDeviceOnly',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly',
}

const AUTHENTICATION_TYPE = {
  DEVICE_PASSCODE_OR_BIOMETRICS: 'AuthenticationWithBiometricsDevicePasscode',
  BIOMETRICS: 'AuthenticationWithBiometrics',
}

const SECURITY_LEVEL = {
  SECURE_SOFTWARE: 'SecureSoftware',
  SECURE_HARDWARE: 'SecureHardware',
}

const STORAGE_TYPE = {
  AES_GCM: 'AesGcm',
}

type KeychainOptions = {
  service?: string
}

let _store: Record<string, { username: string; password: string }> = {}

function readService(options?: KeychainOptions): string {
  return options?.service ?? 'default'
}

const setGenericPassword = jest.fn(async (username: string, password: string, options?: KeychainOptions): Promise<boolean> => {
  _store[readService(options)] = { username, password }
  return true
})

const getGenericPassword = jest.fn(async (options?: KeychainOptions): Promise<{ username: string; password: string } | false> => {
  return _store[readService(options)] ?? false
})

const resetGenericPassword = jest.fn(async (options?: KeychainOptions): Promise<boolean> => {
  delete _store[readService(options)]
  return true
})

export function __resetStore(): void {
  _store = {}
}

export {
  ACCESS_CONTROL,
  ACCESSIBLE,
  AUTHENTICATION_TYPE,
  SECURITY_LEVEL,
  STORAGE_TYPE,
  getGenericPassword,
  resetGenericPassword,
  setGenericPassword,
}

export default {
  setGenericPassword,
  getGenericPassword,
  resetGenericPassword,
  ACCESS_CONTROL,
  ACCESSIBLE,
  AUTHENTICATION_TYPE,
  SECURITY_LEVEL,
  STORAGE_TYPE,
}
