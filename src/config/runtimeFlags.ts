export type VerifierDcqlVpTokenShape = 'object_array' | 'object_string' | 'raw'
export type VerifierKbAudienceMode = 'client_id' | 'response_uri'
export type Oid4vpJweEncOverride = 'A128GCM' | 'A256GCM'

export function isBiometricDisabledForTesting(isDevelopment = __DEV__): boolean {
  return isDevelopment && process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING === 'true'
}

export function isSdJwtKbDisabledForTesting(isDevelopment = __DEV__): boolean {
  return isDevelopment && process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING === 'true'
}

export function readVerifierDcqlVpTokenShape(): VerifierDcqlVpTokenShape {
  const value = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
  if (value === 'object_string' || value === 'raw') return value
  return 'object_array'
}

export function readVerifierKbAudienceMode(): VerifierKbAudienceMode {
  return process.env.EXPO_PUBLIC_VERIFIER_KB_AUD === 'response_uri' ? 'response_uri' : 'client_id'
}

export function readOid4vpJweEncOverride(): Oid4vpJweEncOverride | undefined {
  if (!__DEV__) return undefined

  const value = process.env.EXPO_PUBLIC_OID4VP_JWE_ENC
  return value === 'A128GCM' || value === 'A256GCM' ? value : undefined
}

/**
 * `apv` is on by default to match the OID4VP reference stack, which always binds
 * base64url(request nonce) into the JARM JWE Concat KDF. Verifiers that reconstruct
 * the expected `apv` from their own nonce fail to derive the CEK without it.
 */
export function shouldIncludeOid4vpJweApv(isDevelopment = __DEV__): boolean {
  if (isDevelopment && process.env.EXPO_PUBLIC_OID4VP_JWE_APV === 'false') return false
  return true
}

export function readWalletDemoInteropEnabled(isDevelopment = __DEV__): boolean {
  if (process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP !== 'true') return false
  const buildProfile = process.env.EXPO_PUBLIC_BUILD_PROFILE
  if (buildProfile === 'production') return false
  if (isDevelopment) return true
  return buildProfile === 'preview' && process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP === 'true'
}
