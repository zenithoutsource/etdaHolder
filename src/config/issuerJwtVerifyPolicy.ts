/**
 * Trusted base allowlist for Issuer/Verifier JWT verification (P2 journey 20).
 * Holder signing is independent of this list.
 * Issuer/Verifier metadata may narrow only — never expand beyond this set.
 */
export const TRUSTED_ISSUER_JWT_ALGS = ['ES256', 'EdDSA'] as const

export type TrustedIssuerJwtAlg = (typeof TRUSTED_ISSUER_JWT_ALGS)[number]

export function isTrustedIssuerJwtAlg(alg: string | undefined): alg is TrustedIssuerJwtAlg {
  return alg === 'ES256' || alg === 'EdDSA'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectStringArray(value: unknown, into: string[]): void {
  if (!Array.isArray(value)) return
  for (const entry of value) {
    if (typeof entry === 'string' && entry.length > 0) into.push(entry)
  }
}

/**
 * Peer-advertised verify algorithms from Issuer or Verifier metadata.
 * Unknown fields are ignored. Returns undefined when the peer advertised none
 * so callers keep the full trusted base.
 */
export function readPeerAdvertisedVerifyAlgs(
  metadata: Record<string, unknown> | undefined,
): string[] | undefined {
  if (!metadata) return undefined

  const collected: string[] = []
  collectStringArray(metadata.credential_signing_alg_values_supported, collected)
  collectStringArray(metadata.request_object_signing_alg_values_supported, collected)

  const configurations = metadata.credential_configurations_supported
  if (isRecord(configurations)) {
    for (const configuration of Object.values(configurations)) {
      if (!isRecord(configuration)) continue
      collectStringArray(configuration.credential_signing_alg_values_supported, collected)
    }
  }

  return collected.length > 0 ? collected : undefined
}

function uniqueTrustedAlgs(algs: readonly TrustedIssuerJwtAlg[]): TrustedIssuerJwtAlg[] {
  const seen = new Set<TrustedIssuerJwtAlg>()
  const result: TrustedIssuerJwtAlg[] = []
  for (const alg of algs) {
    if (seen.has(alg)) continue
    seen.add(alg)
    result.push(alg)
  }
  return result
}

/**
 * Effective verify allowlist: trusted local/build base, optionally intersected
 * with peer metadata. Extra metadata algs (e.g. RS256) are dropped, never added.
 */
export function resolveTrustedVerifyAlgs(
  metadataAlgs?: readonly string[] | null,
): TrustedIssuerJwtAlg[] {
  if (!metadataAlgs || metadataAlgs.length === 0) {
    return [...TRUSTED_ISSUER_JWT_ALGS]
  }

  const narrowed = uniqueTrustedAlgs(metadataAlgs.filter(isTrustedIssuerJwtAlg))
  if (narrowed.length === 0) {
    throw new Error(
      'VerifyAlgAllowlistEmpty: peer metadata narrowed the trusted verify base to empty',
    )
  }
  return narrowed
}

export function formatTrustedVerifyAlgs(algs: readonly TrustedIssuerJwtAlg[]): string {
  if (algs.length === 1) return algs[0]!
  if (algs.length === 2) return `${algs[0]} or ${algs[1]}`
  return `${algs.slice(0, -1).join(', ')}, or ${algs[algs.length - 1]}`
}

export function assertTrustedVerifyAlg(
  alg: string | undefined,
  metadataAlgs?: readonly string[] | null,
  context = 'issuer credential',
): asserts alg is TrustedIssuerJwtAlg {
  const allowed = resolveTrustedVerifyAlgs(metadataAlgs)
  if (!alg || !allowed.includes(alg as TrustedIssuerJwtAlg)) {
    throw new Error(
      `CredentialSignatureAlgUnsupported: ${context} alg must be ${formatTrustedVerifyAlgs(allowed)}, got ${alg ?? 'missing'}`,
    )
  }
}
