/** Relative JWKS path on the Verifier origin (from response_uri). Default `/openid4vc/jwks`. */
export const VERIFIER_JWKS_PATH =
  process.env.EXPO_PUBLIC_VERIFIER_JWKS_PATH?.trim() || '/openid4vc/jwks'

/** Verifier JWKS fetch timeout (ms). Default 15_000. */
export const VERIFIER_JWKS_FETCH_TIMEOUT_MS =
  Number(process.env.EXPO_PUBLIC_VERIFIER_JWKS_FETCH_TIMEOUT_MS) || 15_000

/** Max Verifier JWKS response body size (UTF-8 bytes). Default 65_536. */
export const VERIFIER_JWKS_MAX_BYTES =
  Number(process.env.EXPO_PUBLIC_VERIFIER_JWKS_MAX_BYTES) || 65_536
