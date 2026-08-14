import { createPublicKey, ECDH, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto'

import type { Ed25519PublicJwk } from '../config'

import { verifyHolderRevokePop } from './holderRevokePopVerifier'

type P256PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string }

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01])
const P256_MULTICODEC_PREFIX = Buffer.from([0x80, 0x24])

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

function p256PublicJwkToDidKey(publicJwk: P256PublicJwk): string {
  const uncompressed = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ])
  const compressed = ECDH.convertKey(uncompressed, 'prime256v1', undefined, undefined, 'compressed') as Buffer
  const multicodec = Buffer.concat([P256_MULTICODEC_PREFIX, compressed])
  return `did:key:z${base58Encode(multicodec)}`
}

const holderKeys = generateKeyPairSync('ed25519')
const holderPublicJwk = holderKeys.publicKey.export({ format: 'jwk' }) as Ed25519PublicJwk
const holderDid = ed25519PublicJwkToDidKey(holderPublicJwk)
const holderKid = `${holderDid}#${holderDid.slice('did:key:'.length)}`

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

function signES256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: KeyObject,
): string {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${signature.toString('base64url')}`
}

function buildPop(input: {
  nonce: string
  audience: string
  credentialId: string
}): string {
  return signEdDSA(
    { alg: 'EdDSA', typ: 'holder-status-change+jwt', kid: holderKid },
    {
      iss: holderDid,
      sub: holderDid,
      aud: input.audience,
      iat: Math.floor(Date.now() / 1000),
      nonce: input.nonce,
      credential_id: input.credentialId,
      action: 'revoke',
    },
    holderKeys.privateKey,
  )
}

test('verifyHolderRevokePop accepts valid holder status-change PoP', () => {
  const result = verifyHolderRevokePop(
    buildPop({
      nonce: 'nonce-1',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
      credentialId: 'transcript-1',
    }),
    {
      holderDid,
      credentialId: 'transcript-1',
      nonce: 'nonce-1',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
    },
  )

  expect(result).toEqual({ ok: true })
})

test('verifyHolderRevokePop rejects nonce mismatch', () => {
  const result = verifyHolderRevokePop(
    buildPop({
      nonce: 'nonce-1',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
      credentialId: 'transcript-1',
    }),
    {
      holderDid,
      credentialId: 'transcript-1',
      nonce: 'nonce-2',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
    },
  )

  expect(result).toEqual({ ok: false, reason: 'nonce-mismatch' })
})

test('verifyHolderRevokePop rejects invalid signature', () => {
  const pop = buildPop({
    nonce: 'nonce-1',
    audience: 'urn:wallet:dev:issuer:holder-revoke',
    credentialId: 'transcript-1',
  })
  const tampered = `${pop.slice(0, -4)}AAAA`

  const result = verifyHolderRevokePop(tampered, {
    holderDid,
    credentialId: 'transcript-1',
    nonce: 'nonce-1',
    audience: 'urn:wallet:dev:issuer:holder-revoke',
  })

  expect(result.ok).toBe(false)
})

const p256Keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const p256PublicJwk = p256Keys.publicKey.export({ format: 'jwk' }) as P256PublicJwk
const p256HolderDid = p256PublicJwkToDidKey(p256PublicJwk)
const p256HolderKid = `${p256HolderDid}#${p256HolderDid.slice('did:key:'.length)}`

function buildEs256Pop(input: {
  nonce: string
  audience: string
  credentialId: string
}): string {
  return signES256(
    { alg: 'ES256', typ: 'holder-status-change+jwt', kid: p256HolderKid },
    {
      iss: p256HolderDid,
      sub: p256HolderDid,
      aud: input.audience,
      iat: Math.floor(Date.now() / 1000),
      nonce: input.nonce,
      credential_id: input.credentialId,
      action: 'revoke',
    },
    p256Keys.privateKey,
  )
}

test('verifyHolderRevokePop accepts ES256 PoP for a P-256 holder DID', () => {
  const result = verifyHolderRevokePop(
    buildEs256Pop({
      nonce: 'nonce-p256',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
      credentialId: 'urn:uuid:hardware-pid',
    }),
    {
      holderDid: p256HolderDid,
      credentialId: 'urn:uuid:hardware-pid',
      nonce: 'nonce-p256',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
    },
  )

  expect(result).toEqual({ ok: true })
})

test('verifyHolderRevokePop rejects ES256 PoP bound to an Ed25519 holder DID', () => {
  const pop = signES256(
    { alg: 'ES256', typ: 'holder-status-change+jwt', kid: holderKid },
    {
      iss: holderDid,
      sub: holderDid,
      aud: 'urn:wallet:dev:issuer:holder-revoke',
      iat: Math.floor(Date.now() / 1000),
      nonce: 'nonce-p256',
      credential_id: 'urn:uuid:hardware-pid',
      action: 'revoke',
    },
    p256Keys.privateKey,
  )

  expect(
    verifyHolderRevokePop(pop, {
      holderDid,
      credentialId: 'urn:uuid:hardware-pid',
      nonce: 'nonce-p256',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
    }),
  ).toEqual({ ok: false, reason: 'unsupported-holder-did' })
})
