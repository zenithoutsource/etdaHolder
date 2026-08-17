import { isHardwareP256SigningEnabled } from './hardwareSigningPolicy'

describe('isHardwareP256SigningEnabled', () => {
  const originalFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalFlag
    }
  })

  test('defaults to enabled when the env var is unset', () => {
    delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    expect(isHardwareP256SigningEnabled()).toBe(true)
  })

  test('stays enabled when set to true', () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    expect(isHardwareP256SigningEnabled()).toBe(true)
  })

  test('can be disabled with false', () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    expect(isHardwareP256SigningEnabled()).toBe(false)
  })

  test('treats FALSE and 0 as disabled', () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'FALSE'
    expect(isHardwareP256SigningEnabled()).toBe(false)
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = '0'
    expect(isHardwareP256SigningEnabled()).toBe(false)
  })
})
