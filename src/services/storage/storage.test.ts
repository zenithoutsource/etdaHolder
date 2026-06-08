import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'

import { initStorage, resetStorage } from './storage'

describe('credential storage keychain policy', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING

  beforeEach(async () => {
    await resetStorage()
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    })
  })

  afterEach(async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
    await resetStorage()
  })

  test('keeps biometric keychain access control by default', async () => {
    await initStorage()

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-credentials',
      expect.any(String),
      expect.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      })
    )
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
        authenticationPrompt: {
          title: 'Unlock Wallet Storage',
          cancel: 'Cancel',
        },
      })
    )
  })

  test('omits biometric keychain prompts when the dev-only tester flag is enabled', async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'

    await initStorage()

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-credentials',
      expect.any(String),
      expect.not.objectContaining({
        accessControl: expect.anything(),
      })
    )
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(
      expect.not.objectContaining({
        accessControl: expect.anything(),
        authenticationPrompt: expect.anything(),
      })
    )
  })
})
