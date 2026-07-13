import { createHash, createPublicKey, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto'

import type { Ed25519PublicJwk, ServerConfig } from '../config'
import {
  createPresentationSession,
  uploadPresentation,
  verifyPresentationSession,
  V1_GATEWAY_CREDENTIAL_TYPE,
} from './presentationGatewayService'
import { createInMemoryPresentationSessionStore } from './presentationSessionStore'
import { resetSdJwtIssuerKeyCacheForTests } from './sdJwtVerifier'

const issuerKeys = generateKeyPairSync('ed25519')
const holderKeys = generateKeyPairSync('ed25519')
const issuerPublicJwk = issuerKeys.publicKey.export({ format: 'jwk' }) as Ed25519PublicJwk
const holderPublicJwk = holderKeys.publicKey.export({ format: 'jwk' }) as Ed25519PublicJwk

function signEdDSA(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: KeyObject,
): string {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = cryptoSign(null, Buffer.from(signingInput), privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

function buildFixtureVp(input: { nonce: string; aud: string }): string {
  const issuerJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'vc+sd-jwt' },
    { iss: 'https://issuer.dev', vct: V1_GATEWAY_CREDENTIAL_TYPE, cnf: { jwk: holderPublicJwk } },
    issuerKeys.privateKey,
  )
  const sdJwtWithoutKb = `${issuerJwt}~`
  const sdHash = createHash('sha256').update(sdJwtWithoutKb).digest('base64url')
  const kbJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'kb+jwt' },
    { nonce: input.nonce, aud: input.aud, iat: Math.floor(Date.now() / 1000), sd_hash: sdHash },
    holderKeys.privateKey,
  )
  return `${sdJwtWithoutKb}${kbJwt}`
}

const baseConfig: Pick<
  ServerConfig,
  'presentationSessionTtlMs' | 'verifierPresentationBaseUrl' | 'vpIssuerPublicKeyJwk' | 'presentationIssuerJwksCacheMs'
> = {
  presentationSessionTtlMs: 300_000,
  verifierPresentationBaseUrl: 'http://localhost:4000',
  vpIssuerPublicKeyJwk: issuerPublicJwk,
  presentationIssuerJwksCacheMs: 3_600_000,
}

beforeEach(() => {
  resetSdJwtIssuerKeyCacheForTests()
})

test('create → upload → verify marks session verified', async () => {
  const store = createInMemoryPresentationSessionStore()
  const created = createPresentationSession(store, baseConfig)
  expect(created.verifyUrl).toBe(`http://localhost:4000/v1/present/verify?s=${created.sessionId}`)

  const vpToken = buildFixtureVp({ nonce: created.nonce, aud: baseConfig.verifierPresentationBaseUrl })
  expect(uploadPresentation(store, created.sessionId, vpToken, V1_GATEWAY_CREDENTIAL_TYPE)).toEqual({ ok: true })
  expect(store.resolveStatus(created.sessionId)).toBe('ready')

  const verified = await verifyPresentationSession(store, created.sessionId, baseConfig)
  expect(verified.kind).toBe('success')
  expect(store.resolveStatus(created.sessionId)).toBe('verified')
})

test('verify failure finalizes session as verify_failed', async () => {
  const store = createInMemoryPresentationSessionStore()
  const created = createPresentationSession(store, baseConfig)
  const vpToken = buildFixtureVp({ nonce: 'wrong-nonce', aud: baseConfig.verifierPresentationBaseUrl })
  uploadPresentation(store, created.sessionId, vpToken, V1_GATEWAY_CREDENTIAL_TYPE)

  const outcome = await verifyPresentationSession(store, created.sessionId, baseConfig)
  expect(outcome.kind).toBe('verify-failed')
  expect(store.resolveStatus(created.sessionId)).toBe('verify_failed')
  expect(store.getSession(created.sessionId)?.verificationReason).toBe('kb-nonce-mismatch')
})

test('upload rejects non-ThaiNationalID credential type on v1 gateway', () => {
  const store = createInMemoryPresentationSessionStore()
  const created = createPresentationSession(store, baseConfig)
  expect(uploadPresentation(store, created.sessionId, 'vp~kb', 'DrivingLicence')).toEqual({
    ok: false,
    code: 'bad-request',
  })
})
