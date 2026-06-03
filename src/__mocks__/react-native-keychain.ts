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
}

const AUTHENTICATION_TYPE = {
  DEVICE_PASSCODE_OR_BIOMETRICS: 'AuthenticationWithBiometricsDevicePasscode',
  BIOMETRICS: 'AuthenticationWithBiometrics',
}

let _store: Record<string, { username: string; password: string }> = {}

const setGenericPassword = jest.fn(async (username: string, password: string): Promise<boolean> => {
  _store['default'] = { username, password }
  return true
})

const getGenericPassword = jest.fn(async (): Promise<{ username: string; password: string } | false> => {
  return _store['default'] ?? false
})

const resetGenericPassword = jest.fn(async (): Promise<boolean> => {
  delete _store['default']
  return true
})

export function __resetStore(): void {
  _store = {}
}

export default {
  setGenericPassword,
  getGenericPassword,
  resetGenericPassword,
  ACCESS_CONTROL,
  ACCESSIBLE,
  AUTHENTICATION_TYPE,
}
