import {
  isBiometricDisabledForTesting,
  isSdJwtKbDisabledForTesting,
  isSoftwareEddsaEnabledForTesting,
  readVerifierDcqlVpTokenShape,
  readVerifierKbAudienceMode,
} from './runtimeFlags'

describe('runtime flags', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
  const originalSdJwtFlag = process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING
  const originalSoftwareEddsaFlag = process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING
  const originalDcqlShape = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
  const originalKbAudience = process.env.EXPO_PUBLIC_VERIFIER_KB_AUD

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = originalSdJwtFlag
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = originalSoftwareEddsaFlag
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = originalDcqlShape
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = originalKbAudience
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

  test('allows software EdDSA only in development', () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'

    expect(isSoftwareEddsaEnabledForTesting(true)).toBe(true)
    expect(isSoftwareEddsaEnabledForTesting(false)).toBe(false)
  })

  test('does not allow software EdDSA when the flag is absent', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING

    expect(isSoftwareEddsaEnabledForTesting(true)).toBe(false)
  })

  test('reads the verifier DCQL vp_token shape only in development', () => {
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = 'raw'

    expect(readVerifierDcqlVpTokenShape(true)).toBe('raw')
    expect(readVerifierDcqlVpTokenShape(false)).toBe('object_array')
  })

  test('defaults invalid verifier DCQL vp_token shapes to object_array', () => {
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = 'invalid'

    expect(readVerifierDcqlVpTokenShape(true)).toBe('object_array')
  })

  test('reads the verifier KB audience mode only in development', () => {
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = 'response_uri'

    expect(readVerifierKbAudienceMode(true)).toBe('response_uri')
    expect(readVerifierKbAudienceMode(false)).toBe('client_id')
  })

  test('defaults invalid verifier KB audience modes to client_id', () => {
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = 'invalid'

    expect(readVerifierKbAudienceMode(true)).toBe('client_id')
  })
})
