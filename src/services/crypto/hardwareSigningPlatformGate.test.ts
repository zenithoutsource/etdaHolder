import { Platform } from 'react-native'

import { assertHardwareSigningPlatformAllowed, isHardwareSigningPlatformBlocked } from './hardwareSigningPlatformGate'

describe('hardwareSigningPlatformGate', () => {
  const originalEnv = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalEnv
  })

  test('does not block when hardware signing flag is disabled', () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    expect(() => assertHardwareSigningPlatformAllowed()).not.toThrow()
    expect(isHardwareSigningPlatformBlocked()).toBe(false)
  })

  test('blocks iOS when hardware signing flag is enabled', () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })

    expect(isHardwareSigningPlatformBlocked()).toBe(true)
    expect(() => assertHardwareSigningPlatformAllowed()).toThrow('iOS production holder signing is blocked')
  })

  test('allows Android when hardware signing flag is enabled', () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })

    expect(isHardwareSigningPlatformBlocked()).toBe(false)
    expect(() => assertHardwareSigningPlatformAllowed()).not.toThrow()
  })
})
