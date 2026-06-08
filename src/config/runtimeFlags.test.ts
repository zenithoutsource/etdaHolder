import { isBiometricDisabledForTesting } from './runtimeFlags'

describe('runtime flags', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
  })

  test('allows the biometric test bypass only in development', () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'

    expect(isBiometricDisabledForTesting(true)).toBe(true)
    expect(isBiometricDisabledForTesting(false)).toBe(false)
  })

  test('does not allow the biometric test bypass when the flag is absent', () => {
    delete process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING

    expect(isBiometricDisabledForTesting(true)).toBe(false)
  })
})
