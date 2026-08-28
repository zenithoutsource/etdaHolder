import {
  isBiometricDisabledForTesting,
  isSdJwtKbDisabledForTesting,
  readOid4vpJweEncOverride,
  readWalletDemoInteropEnabled,
  readVerifierDcqlVpTokenShape,
  readVerifierKbAudienceMode,
  shouldIncludeOid4vpJweApv,
} from './runtimeFlags'

describe('runtime flags', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
  const originalSdJwtFlag = process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING
  const originalDcqlShape = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
  const originalKbAudience = process.env.EXPO_PUBLIC_VERIFIER_KB_AUD
  const originalOid4vpJweEnc = process.env.EXPO_PUBLIC_OID4VP_JWE_ENC
  const originalOid4vpJweApv = process.env.EXPO_PUBLIC_OID4VP_JWE_APV
  const originalWalletDemoInterop = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
  const originalAllowNonDevDemoInterop = process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP
  const originalBuildProfile = process.env.EXPO_PUBLIC_BUILD_PROFILE

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = originalSdJwtFlag
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = originalDcqlShape
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = originalKbAudience
    process.env.EXPO_PUBLIC_OID4VP_JWE_ENC = originalOid4vpJweEnc
    process.env.EXPO_PUBLIC_OID4VP_JWE_APV = originalOid4vpJweApv
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalWalletDemoInterop
    process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP = originalAllowNonDevDemoInterop
    process.env.EXPO_PUBLIC_BUILD_PROFILE = originalBuildProfile
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

  test('reads the A256GCM OID4VP JWE content-encryption dev override', () => {
    process.env.EXPO_PUBLIC_OID4VP_JWE_ENC = 'A256GCM'

    expect(readOid4vpJweEncOverride()).toBe('A256GCM')
  })

  test('includes OID4VP JWE apv by default and honours the development opt-out', () => {
    delete process.env.EXPO_PUBLIC_OID4VP_JWE_APV
    expect(shouldIncludeOid4vpJweApv(true)).toBe(true)
    expect(shouldIncludeOid4vpJweApv(false)).toBe(true)

    process.env.EXPO_PUBLIC_OID4VP_JWE_APV = 'false'
    expect(shouldIncludeOid4vpJweApv(true)).toBe(false)
    expect(shouldIncludeOid4vpJweApv(false)).toBe(true)
  })

  test('enables demo interop only in development when flag is true', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    delete process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP

    expect(readWalletDemoInteropEnabled(true)).toBe(true)
    expect(readWalletDemoInteropEnabled(false)).toBe(false)
  })

  test('allows demo interop outside __DEV__ only in an EAS preview build with explicit allow flag', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP = 'true'
    process.env.EXPO_PUBLIC_BUILD_PROFILE = 'preview'

    expect(readWalletDemoInteropEnabled(false)).toBe(true)
  })

  test('disables demo interop in a production build regardless of enabled demo variables', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP = 'true'
    process.env.EXPO_PUBLIC_BUILD_PROFILE = 'production'

    expect(readWalletDemoInteropEnabled(false)).toBe(false)
  })

  test('demo interop is off when master flag absent', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    expect(readWalletDemoInteropEnabled(true)).toBe(false)
  })

})
