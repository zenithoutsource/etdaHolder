import { createHash, createPublicKey, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto'

import type { Ed25519PublicJwk } from '../config'

import { splitSdJwtKbPresentation, verifySdJwtKbPresentation, verifySdJwtKbPresentationAsync, resetSdJwtIssuerKeyCacheForTests } from './sdJwtVerifier'
import * as resolveVpIssuerKey from './resolveVpIssuerKey'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01])

function base58Encode(bytes: Buffer): string {
  let leadingOnes = 0
  for (const byte of bytes) {
    if (byte !== 0) break
    leadingOnes += 1
  }

  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)

  let encoded = ''
  while (value > 0n) {
    const remainder = Number(value % 58n)
    encoded = BASE58_ALPHABET[remainder]! + encoded
    value /= 58n
  }

  return `${'1'.repeat(leadingOnes)}${encoded}`
}

function ed25519PublicJwkToDidKey(publicJwk: Ed25519PublicJwk): string {
  const der = createPublicKey({ key: publicJwk, format: 'jwk' }).export({ type: 'spki', format: 'der' }) as Buffer
  const rawPublicKey = der.subarray(-32)
  const multicodec = Buffer.concat([ED25519_MULTICODEC_PREFIX, rawPublicKey])
  return `did:key:z${base58Encode(multicodec)}`
}

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
    { iss: 'https://issuer.dev', vct: 'ThaiNationalID', cnf: { jwk: holderPublicJwk }, givenName: 'Ada' },
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

const verifyContext = {
  nonce: 'abc',
  relayBaseUrl: 'http://localhost:4000',
  maxAgeMs: 300_000,
  issuerPublicKeyJwk: issuerPublicJwk,
}

test('splitSdJwtKbPresentation keeps trailing tilde in sd portion', () => {
  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  const parts = splitSdJwtKbPresentation(vp)
  expect(parts?.sdJwtWithoutKb.endsWith('~')).toBe(true)
  expect(parts?.kbJwt.includes('.')).toBe(true)
})

test('verifySdJwtKbPresentation accepts valid token', () => {
  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  const result = verifySdJwtKbPresentation(vp, verifyContext)
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.issuerName).toBe('https://issuer.dev')
    expect(result.claims.some((claim) => claim.label === 'givenName')).toBe(true)
  }
})

test('verifySdJwtKbPresentation accepts cnf.kid did:key holder binding', () => {
  const holderDid = ed25519PublicJwkToDidKey(holderPublicJwk)
  const holderKid = `${holderDid}#${holderDid.slice('did:key:'.length)}`
  const issuerJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'vc+sd-jwt' },
    { iss: 'https://issuer.dev', vct: 'ThaiNationalID', cnf: { kid: holderKid }, givenName: 'Ada' },
    issuerKeys.privateKey,
  )
  const sdJwtWithoutKb = `${issuerJwt}~`
  const sdHash = createHash('sha256').update(sdJwtWithoutKb).digest('base64url')
  const kbJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'kb+jwt' },
    { nonce: 'abc', aud: 'http://localhost:4000', iat: Math.floor(Date.now() / 1000), sd_hash: sdHash },
    holderKeys.privateKey,
  )
  const result = verifySdJwtKbPresentation(`${sdJwtWithoutKb}${kbJwt}`, verifyContext)
  expect(result.ok).toBe(true)
})

test('rejects wrong nonce', () => {
  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  expect(verifySdJwtKbPresentation(vp, { ...verifyContext, nonce: 'wrong' })).toEqual({
    ok: false,
    reason: 'kb-nonce-mismatch',
  })
})

test('rejects wrong aud', () => {
  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  expect(verifySdJwtKbPresentation(vp, { ...verifyContext, relayBaseUrl: 'http://evil.example' })).toEqual({
    ok: false,
    reason: 'kb-aud-mismatch',
  })
})

test('rejects sd-jwt without kb segment', () => {
  const issuerJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'vc+sd-jwt' },
    { iss: 'x', cnf: { jwk: holderPublicJwk } },
    issuerKeys.privateKey,
  )
  expect(verifySdJwtKbPresentation(`${issuerJwt}~`, verifyContext)).toEqual({ ok: false, reason: 'kb-missing' })
})

test('rejects stale iat', () => {
  const issuerJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'vc+sd-jwt' },
    { iss: 'https://issuer.dev', cnf: { jwk: holderPublicJwk } },
    issuerKeys.privateKey,
  )
  const sdJwtWithoutKb = `${issuerJwt}~`
  const sdHash = createHash('sha256').update(sdJwtWithoutKb).digest('base64url')
  const kbJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'kb+jwt' },
    { nonce: 'abc', aud: 'http://localhost:4000', iat: Math.floor(Date.now() / 1000) - 10_000, sd_hash: sdHash },
    holderKeys.privateKey,
  )
  expect(verifySdJwtKbPresentation(`${sdJwtWithoutKb}${kbJwt}`, verifyContext)).toEqual({
    ok: false,
    reason: 'kb-iat-stale',
  })
})

test('verifySdJwtKbPresentationAsync resolves issuer key when pin absent', async () => {
  resetSdJwtIssuerKeyCacheForTests()
  const resolveSpy = jest
    .spyOn(resolveVpIssuerKey, 'resolveVpIssuerPublicKeyFromRawVc')
    .mockResolvedValue(issuerPublicJwk)

  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  const result = await verifySdJwtKbPresentationAsync(vp, {
    nonce: 'abc',
    relayBaseUrl: 'http://localhost:4000',
    maxAgeMs: 300_000,
  })

  expect(resolveSpy).toHaveBeenCalled()
  expect(result.ok).toBe(true)
  resolveSpy.mockRestore()
})
