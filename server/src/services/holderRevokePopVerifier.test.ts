import { createPublicKey, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto'

import type { Ed25519PublicJwk } from '../config'

import { verifyHolderRevokePop } from './holderRevokePopVerifier'

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
