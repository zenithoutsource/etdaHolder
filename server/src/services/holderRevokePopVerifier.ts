import { createPublicKey, verify as cryptoVerify } from 'node:crypto'

import type { Ed25519PublicJwk } from '../config'

import { decodeBase64UrlJson, didKeyToEd25519PublicJwk } from './resolveVpIssuerKey'

export type HolderRevokePopExpectation = {
  holderDid: string
  credentialId: string
  nonce: string
  audience: string
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function verifyHolderRevokePop(
  popJwt: string,
  expected: HolderRevokePopExpectation,
): { ok: true } | { ok: false; reason: string } {
  const parts = popJwt.split('.')
  if (parts.length !== 3) {
    return { ok: false, reason: 'invalid-jwt-shape' }
  }

  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    header = decodeBase64UrlJson(parts[0]!)
    payload = decodeBase64UrlJson(parts[1]!)
  } catch {
    return { ok: false, reason: 'invalid-jwt-json' }
  }

  if (readString(header.alg) !== 'EdDSA') {
    return { ok: false, reason: 'invalid-alg' }
  }

  const iss = readString(payload.iss)
  const sub = readString(payload.sub)
  if (iss !== expected.holderDid || sub !== expected.holderDid) {
    return { ok: false, reason: 'holder-did-mismatch' }
  }

  if (readString(payload.nonce) !== expected.nonce) {
    return { ok: false, reason: 'nonce-mismatch' }
  }

  if (readString(payload.aud) !== expected.audience) {
    return { ok: false, reason: 'audience-mismatch' }
  }

  const credentialId = readString(payload.credential_id) ?? readString(payload.credentialId)
  if (credentialId !== expected.credentialId) {
    return { ok: false, reason: 'credential-id-mismatch' }
  }

  const action = readString(payload.action)
  if (action !== undefined && action !== 'revoke') {
    return { ok: false, reason: 'action-mismatch' }
  }

  let holderPublicJwk: Ed25519PublicJwk
  try {
    holderPublicJwk = didKeyToEd25519PublicJwk(expected.holderDid)
  } catch {
    return { ok: false, reason: 'unsupported-holder-did' }
  }

  if (!verifyEdDSA(popJwt, holderPublicJwk)) {
    return { ok: false, reason: 'signature-invalid' }
  }

  return { ok: true }
}
