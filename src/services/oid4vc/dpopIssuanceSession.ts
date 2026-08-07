import type { JwtSignerJwk, RequestDpopOptions, SignJwtCallback } from '@openid4vc/oauth2'
import { createSign, generateKeyPairSync, type KeyObject } from 'react-native-quick-crypto'

export type DpopIssuanceSession = {
  privateKey: KeyObject
  publicJwk: JwtSignerJwk['publicJwk']
  signer: JwtSignerJwk
  nonce?: string
}

const deferredDpopSessions = new Map<string, DpopIssuanceSession>()

export function isDpopIssuanceEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_OID4VC_DPOP_ENABLED
  if (raw === 'false' || raw === '0') return false
  return true
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer.toString('base64url')
}

function readEcPublicJwk(publicKey: KeyObject): JwtSignerJwk['publicJwk'] {
  const exported = publicKey.export({ format: 'jwk' }) as JsonWebKey
  if (exported.kty !== 'EC' || exported.crv !== 'P-256' || !exported.x || !exported.y) {
    throw new Error('DpopSessionKeyInvalid: expected P-256 EC public JWK')
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: exported.x,
    y: exported.y,
  }
}

export function createDpopIssuanceSession(): DpopIssuanceSession {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const publicJwk = readEcPublicJwk(publicKey)
  const signer: JwtSignerJwk = {
    method: 'jwk',
    alg: 'ES256',
    publicJwk,
  }

  return {
    privateKey,
    publicJwk,
    signer,
  }
}

export function getRequestDpopOptions(session: DpopIssuanceSession): RequestDpopOptions {
  return session.nonce ? { signer: session.signer, nonce: session.nonce } : { signer: session.signer }
}

export function applyLibDpopState(session: DpopIssuanceSession, dpop?: RequestDpopOptions): void {
  if (!dpop) return
  session.signer = dpop.signer
  session.nonce = dpop.nonce
}

export function createDpopSignJwtCallback(session: DpopIssuanceSession): SignJwtCallback {
  return async (jwtSigner, jwt) => {
    if (jwtSigner.method !== 'jwk') {
      throw new Error('DpopSignJwtUnsupported: only jwk DPoP signers are supported')
    }

    if (jwt.header.typ !== 'dpop+jwt') {
      throw new Error('DpopSignJwtUnsupported: signJwt callback is scoped to DPoP proofs only')
    }

    const encodedHeader = base64UrlEncode(JSON.stringify(jwt.header))
    const encodedPayload = base64UrlEncode(JSON.stringify(jwt.payload))
    const signingInput = `${encodedHeader}.${encodedPayload}`
    const signature = createSign('SHA256')
      .update(signingInput)
      .sign(session.privateKey, 'base64url')

    return {
      jwt: `${signingInput}.${signature}`,
      signerJwk: session.publicJwk,
    }
  }
}

export function registerDpopSessionForDeferred(transactionId: string, session: DpopIssuanceSession): void {
  deferredDpopSessions.set(transactionId, session)
}

export function takeDpopSessionForDeferred(transactionId: string): DpopIssuanceSession | undefined {
  return deferredDpopSessions.get(transactionId)
}

export function clearDpopSessionForDeferred(transactionId: string): void {
  deferredDpopSessions.delete(transactionId)
}

export function clearDpopIssuanceSession(session: DpopIssuanceSession): void {
  session.nonce = undefined
}
