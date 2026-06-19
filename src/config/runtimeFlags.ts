export type VerifierDcqlVpTokenShape = 'object_array' | 'object_string' | 'raw'
export type VerifierKbAudienceMode = 'client_id' | 'response_uri'

export function isBiometricDisabledForTesting(isDevelopment = __DEV__): boolean {
  return isDevelopment && process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING === 'true'
}

export function isSdJwtKbDisabledForTesting(isDevelopment = __DEV__): boolean {
  return isDevelopment && process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING === 'true'
}

export function readVerifierDcqlVpTokenShape(isDevelopment = __DEV__): VerifierDcqlVpTokenShape {
  if (!isDevelopment) return 'object_array'

  const value = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
  if (value === 'object_string' || value === 'raw') return value
  return 'object_array'
}

export function readVerifierKbAudienceMode(isDevelopment = __DEV__): VerifierKbAudienceMode {
  if (!isDevelopment) return 'client_id'

  return process.env.EXPO_PUBLIC_VERIFIER_KB_AUD === 'response_uri' ? 'response_uri' : 'client_id'
}
