import { p256 } from '@noble/curves/nist.js'

import {
  P256_MULTICODEC_PREFIX,
  assertEs256SignatureBytes,
  base58btcEncode,
  compressP256PublicKey,
  didKeyToP256PublicJwk,
  p256JwkToPublicKey,
  p256PublicKeyToCoseKey,
  p256PublicKeyToDidKey,
  p256PublicKeyToJwk,
  signEs256Prehash,
  verifyEs256Prehash,
} from './p256Identity'

const TEST_KEYPAIR = p256.keygen()
const TEST_PRIVATE_KEY = TEST_KEYPAIR.secretKey
const TEST_PUBLIC_KEY = TEST_KEYPAIR.publicKey

describe('p256Identity', () => {
  test('compresses 65-byte uncompressed public keys to 33 bytes', () => {
    const uncompressed = p256.getPublicKey(TEST_PRIVATE_KEY, false)
    expect(uncompressed.length).toBe(65)
    expect(compressP256PublicKey(uncompressed).length).toBe(33)
  })

  test('builds EC P-256 JWK from compressed public key', () => {
    const jwk = p256PublicKeyToJwk(TEST_PUBLIC_KEY)
    expect(jwk).toEqual({
      kty: 'EC',
      crv: 'P-256',
      x: expect.any(String),
      y: expect.any(String),
    })
  })

  test('round-trips JWK to compressed public key bytes', () => {
    const jwk = p256PublicKeyToJwk(TEST_PUBLIC_KEY)
    const restored = p256JwkToPublicKey(jwk)
    expect(restored).toEqual(TEST_PUBLIC_KEY)
  })

  test('encodes did:key with [0x80, 0x24] multicodec prefix and 33-byte compressed key', () => {
    const did = p256PublicKeyToDidKey(TEST_PUBLIC_KEY)
    expect(did.startsWith('did:key:z')).toBe(true)

    const multibase = did.slice('did:key:z'.length)
    const raw = decodeBase58(multibase)
    expect(raw[0]).toBe(P256_MULTICODEC_PREFIX[0])
    expect(raw[1]).toBe(P256_MULTICODEC_PREFIX[1])
    expect(raw.length).toBe(P256_MULTICODEC_PREFIX.length + 33)
    expect(raw.slice(2)).toEqual(TEST_PUBLIC_KEY)
  })

  test('decodes did:key back to the same JWK', () => {
    const did = p256PublicKeyToDidKey(TEST_PUBLIC_KEY)
    const decoded = didKeyToP256PublicJwk(did)
    expect(decoded).toEqual(p256PublicKeyToJwk(TEST_PUBLIC_KEY))
  })

  test('builds locked mdoc COSE_Key map', () => {
    const cose = p256PublicKeyToCoseKey(TEST_PUBLIC_KEY)
    expect(cose[1]).toBe(2)
    expect(cose[3]).toBe(-7)
    expect(cose[-1]).toBe(1)
    expect(cose[-2]?.length).toBe(32)
    expect(cose[-3]?.length).toBe(32)
  })

  test('signEs256Prehash returns 64-byte r‖s and verifies', () => {
    const message = new TextEncoder().encode('wallet-es256-test')
    const signature = signEs256Prehash(message, TEST_PRIVATE_KEY)
    assertEs256SignatureBytes(signature)
    expect(verifyEs256Prehash(message, signature, TEST_PUBLIC_KEY)).toBe(true)
  })

  test('base58btcEncode matches did:key multibase segment', () => {
    const multicodecBytes = new Uint8Array(P256_MULTICODEC_PREFIX.length + TEST_PUBLIC_KEY.length)
    multicodecBytes.set(P256_MULTICODEC_PREFIX)
    multicodecBytes.set(TEST_PUBLIC_KEY, P256_MULTICODEC_PREFIX.length)
    const did = p256PublicKeyToDidKey(TEST_PUBLIC_KEY)
    expect(did).toBe(`did:key:z${base58btcEncode(multicodecBytes)}`)
  })
})

function decodeBase58(input: string): Uint8Array {
  const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let zeros = 0
  for (const char of input) {
    if (char !== '1') break
    zeros += 1
  }

  let value = 0n
  for (const char of input) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('InvalidBase58')
    value = value * 58n + BigInt(index)
  }

  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`
  const decoded = hex.length > 0 ? hex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)) : []
  const bytes = new Uint8Array(zeros + decoded.length)
  bytes.set(decoded, zeros)
  return bytes
}
