import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'

import type { Ed25519PublicJwk } from '../config'

import { didKeyToEd25519PublicJwk, resolveVpIssuerPublicKeyFromRawVc } from './resolveVpIssuerKey'

export type VerifiedVpClaim = {
  label: string
  value: string
}

export type SdJwtVerificationResult =
  | {
      ok: true
      credentialType: string
      issuerName: string
      claims: VerifiedVpClaim[]
    }
  | {
      ok: false
      reason: string
    }

export function splitSdJwtKbPresentation(vpToken: string): { sdJwtWithoutKb: string; kbJwt: string } | undefined {
  const tildeIndex = vpToken.lastIndexOf('~')
  if (tildeIndex < 0) return undefined

  const afterTilde = vpToken.slice(tildeIndex + 1)
  if (!afterTilde.includes('.')) return undefined

  return {
    sdJwtWithoutKb: vpToken.slice(0, tildeIndex + 1),
    kbJwt: afterTilde,
  }
}

function decodeJwtPart<T extends Record<string, unknown>>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T
}

function verifyEdDSA(jwt: string, publicJwk: Ed25519PublicJwk): boolean {
  const [headerB64, payloadB64, sigB64] = jwt.split('.')
  if (!headerB64 || !payloadB64 || !sigB64) return false

  const key = createPublicKey({ key: publicJwk, format: 'jwk' })
  return cryptoVerify(
    null,
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(sigB64, 'base64url'),
  )
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readEd25519PublicJwk(value: unknown): Ed25519PublicJwk | undefined {
  const record = readRecord(value)
  if (!record) return undefined
  if (record.kty !== 'OKP' || record.crv !== 'Ed25519' || typeof record.x !== 'string') return undefined
  return { kty: 'OKP', crv: 'Ed25519', x: record.x }
}

function resolveHolderPublicJwk(cnf: Record<string, unknown> | undefined): Ed25519PublicJwk | undefined {
  if (!cnf) return undefined

  const jwk = readEd25519PublicJwk(cnf.jwk)
  if (jwk) return jwk

  const kid = readString(cnf.kid)
  if (!kid?.startsWith('did:key:')) return undefined

  try {
    return didKeyToEd25519PublicJwk(kid.split('#')[0]!)
  } catch {
    return undefined
  }
}

export function extractDisclosedClaims(
  sdJwtWithoutKb: string,
  issuerPayload: Record<string, unknown>,
): VerifiedVpClaim[] {
  const segments = sdJwtWithoutKb.split('~').filter((segment) => segment.length > 0)
  const issuerJwt = segments[0] ?? ''
  const disclosureSegments = segments.slice(1)
  const claims: VerifiedVpClaim[] = []

  for (const disclosure of disclosureSegments) {
    try {
      const decoded = JSON.parse(Buffer.from(disclosure, 'base64url').toString('utf8')) as unknown
      if (!Array.isArray(decoded) || decoded.length < 3) continue
      const claimName = decoded[1]
      const claimValue = decoded[2]
      if (typeof claimName !== 'string') continue
      claims.push({
        label: claimName,
        value: formatClaimValue(claimValue),
      })
    } catch {
      continue
    }
  }

  if (claims.length > 0) return claims

  for (const [key, value] of Object.entries(issuerPayload)) {
    if (key.startsWith('_') || key === 'iss' || key === 'cnf' || key === 'vct' || key === 'iat' || key === 'exp') {
      continue
    }
    claims.push({ label: key, value: formatClaimValue(value) })
  }

  if (claims.length === 0 && issuerJwt) {
    claims.push({ label: 'Credential', value: 'Presented' })
  }

  return claims
}

function formatClaimValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function verifySdJwtKbPresentation(
  vpToken: string,
  context: {
    nonce: string
    relayBaseUrl: string
    maxAgeMs: number
    issuerPublicKeyJwk?: Ed25519PublicJwk
  },
): SdJwtVerificationResult {
  const parts = splitSdJwtKbPresentation(vpToken)
  if (!parts) return { ok: false, reason: 'kb-missing' }

  if (!context.issuerPublicKeyJwk) {
    return { ok: false, reason: 'issuer-key-not-configured' }
  }

  const issuerJwt = parts.sdJwtWithoutKb.split('~')[0] ?? ''
  if (!issuerJwt || !verifyEdDSA(issuerJwt, context.issuerPublicKeyJwk)) {
    return { ok: false, reason: 'issuer-signature-invalid' }
  }

  const issuerPayload = decodeJwtPart<Record<string, unknown>>(issuerJwt.split('.')[1] ?? '')
  const holderPublicJwk = resolveHolderPublicJwk(readRecord(issuerPayload.cnf))
  if (!holderPublicJwk) return { ok: false, reason: 'cnf-missing' }
  if (!verifyEdDSA(parts.kbJwt, holderPublicJwk)) {
    return { ok: false, reason: 'kb-signature-invalid' }
  }

  const kbPayload = decodeJwtPart<Record<string, unknown>>(parts.kbJwt.split('.')[1] ?? '')
  if (kbPayload.nonce !== context.nonce) return { ok: false, reason: 'kb-nonce-mismatch' }
  if (kbPayload.aud !== context.relayBaseUrl) return { ok: false, reason: 'kb-aud-mismatch' }

  const expectedSdHash = createHash('sha256').update(parts.sdJwtWithoutKb).digest('base64url')
  if (kbPayload.sd_hash !== expectedSdHash) return { ok: false, reason: 'sd-hash-mismatch' }

  const iat = typeof kbPayload.iat === 'number' ? kbPayload.iat : Number.NaN
  const nowSec = Math.floor(Date.now() / 1000)
  const maxAgeSec = Math.floor(context.maxAgeMs / 1000) + 60
  if (!Number.isFinite(iat) || iat > nowSec + 60 || nowSec - iat > maxAgeSec) {
    return { ok: false, reason: 'kb-iat-stale' }
  }

  return {
    ok: true,
    credentialType: String(issuerPayload.vct ?? 'Credential'),
    issuerName: String(issuerPayload.iss ?? 'Unknown'),
    claims: extractDisclosedClaims(parts.sdJwtWithoutKb, issuerPayload),
  }
}

type IssuerKeyCacheEntry = {
  jwk: Ed25519PublicJwk
  expiresAtMs: number
}

const issuerKeyCache = new Map<string, IssuerKeyCacheEntry>()

function readSdJwtIssuerPortion(vpToken: string): string | undefined {
  const parts = splitSdJwtKbPresentation(vpToken)
  if (!parts) return undefined
  return parts.sdJwtWithoutKb
}

function issuerCacheKey(sdJwtPortion: string): string {
  const issuerJwt = sdJwtPortion.split('~')[0] ?? ''
  const [headerB64, payloadB64] = issuerJwt.split('.')
  if (!payloadB64) return sdJwtPortion
  try {
    const header = headerB64 ? decodeJwtPart<Record<string, unknown>>(headerB64) : {}
    const payload = decodeJwtPart<Record<string, unknown>>(payloadB64)
    const iss = readString(payload.iss) ?? 'unknown-issuer'
    const kid = readString(header.kid)
    return `${iss}:${kid ?? 'no-kid'}`
  } catch {
    return sdJwtPortion
  }
}

async function resolveIssuerPublicKeyJwk(
  vpToken: string,
  pinnedJwk: Ed25519PublicJwk | undefined,
  jwksCacheMs: number,
): Promise<Ed25519PublicJwk | undefined> {
  if (pinnedJwk) return pinnedJwk

  const sdJwtPortion = readSdJwtIssuerPortion(vpToken)
  if (!sdJwtPortion) return undefined

  const cacheKey = issuerCacheKey(sdJwtPortion)
  const cached = issuerKeyCache.get(cacheKey)
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.jwk
  }

  try {
    const jwk = await resolveVpIssuerPublicKeyFromRawVc(sdJwtPortion)
    issuerKeyCache.set(cacheKey, { jwk, expiresAtMs: Date.now() + jwksCacheMs })
    return jwk
  } catch {
    return undefined
  }
}

export function resetSdJwtIssuerKeyCacheForTests(): void {
  issuerKeyCache.clear()
}

export async function verifySdJwtKbPresentationAsync(
  vpToken: string,
  context: {
    nonce: string
    relayBaseUrl: string
    maxAgeMs: number
    issuerPublicKeyJwk?: Ed25519PublicJwk
    jwksCacheMs?: number
  },
): Promise<SdJwtVerificationResult> {
  const issuerPublicKeyJwk = await resolveIssuerPublicKeyJwk(
    vpToken,
    context.issuerPublicKeyJwk,
    context.jwksCacheMs ?? 3_600_000,
  )

  return verifySdJwtKbPresentation(vpToken, {
    ...context,
    issuerPublicKeyJwk,
  })
}
