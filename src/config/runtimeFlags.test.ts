import {
  isBiometricDisabledForTesting,
  isSdJwtKbDisabledForTesting,
  readWalletDemoInteropEnabled,
  readVerifierDcqlVpTokenShape,
  readVerifierKbAudienceMode,
} from './runtimeFlags'

describe('runtime flags', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
  const originalSdJwtFlag = process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING
  const originalDcqlShape = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
  const originalKbAudience = process.env.EXPO_PUBLIC_VERIFIER_KB_AUD
  const originalWalletDemoInterop = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
  const originalAllowNonDevDemoInterop = process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = originalSdJwtFlag
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = originalDcqlShape
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = originalKbAudience
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalWalletDemoInterop
    process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP = originalAllowNonDevDemoInterop
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

  test('allows the SD-JWT KB test bypass only in development', () => {
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = 'true'

    expect(isSdJwtKbDisabledForTesting(true)).toBe(true)
    expect(isSdJwtKbDisabledForTesting(false)).toBe(false)
  })

  test('does not allow the SD-JWT KB test bypass when the flag is absent', () => {
    delete process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING

    expect(isSdJwtKbDisabledForTesting(true)).toBe(false)
  })

  test('reads the verifier DCQL vp_token shape in preview and development', () => {
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = 'raw'

    expect(readVerifierDcqlVpTokenShape()).toBe('raw')
  })

  test('defaults invalid verifier DCQL vp_token shapes to object_array', () => {
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = 'invalid'

    expect(readVerifierDcqlVpTokenShape()).toBe('object_array')
  })

  test('reads the verifier KB audience mode in preview and development', () => {
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = 'response_uri'

    expect(readVerifierKbAudienceMode()).toBe('response_uri')
  })

  test('defaults invalid verifier KB audience modes to client_id', () => {
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = 'invalid'

    expect(readVerifierKbAudienceMode()).toBe('client_id')
  })

  test('enables demo interop only in development when flag is true', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    delete process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP

    expect(readWalletDemoInteropEnabled(true)).toBe(true)
    expect(readWalletDemoInteropEnabled(false)).toBe(false)
  })

  test('allows demo interop outside __DEV__ only with explicit allow flag', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP = 'true'

    expect(readWalletDemoInteropEnabled(false)).toBe(true)
  })

  test('demo interop is off when master flag absent', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    expect(readWalletDemoInteropEnabled(true)).toBe(false)
  })
})
