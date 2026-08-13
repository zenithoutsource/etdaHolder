/**
 * Trusted base allowlist for Issuer JWT verification (P2 journey 20).
 * Holder signing is independent of this list.
 * Issuer/Verifier metadata may narrow only — never expand beyond this set.
 */
export const TRUSTED_ISSUER_JWT_ALGS = ['ES256', 'EdDSA'] as const

export type TrustedIssuerJwtAlg = (typeof TRUSTED_ISSUER_JWT_ALGS)[number]

export function isTrustedIssuerJwtAlg(alg: string | undefined): alg is TrustedIssuerJwtAlg {
  return alg === 'ES256' || alg === 'EdDSA'
}
