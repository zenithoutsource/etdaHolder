import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'

import {
  decryptCompactJweEcdhEsP256ForTest,
  encryptCompactJweEcdhEsP256,
  type Oid4vpEncryptionRecipientJwk,
} from './jweEcdhEs'

function buildRecipientFixture(): {
  privateKey: Uint8Array
  jwk: Oid4vpEncryptionRecipientJwk
} {
  const privateKey = p256.keygen().secretKey
  const publicJwk = p256PublicKeyToJwk(p256.getPublicKey(privateKey, false))
  return {
    privateKey,
    jwk: {
      ...publicJwk,
      alg: 'ECDH-ES',
      kid: 'enc-1',
      use: 'enc',
    },
  }
}

function buildRecipientFixtureWithShortLeadingZeroXCoordinate(): {
  privateKey: Uint8Array
  jwk: Oid4vpEncryptionRecipientJwk
} {
  for (let value = 1; value < 4096; value += 1) {
    const privateKey = new Uint8Array(32)
    new DataView(privateKey.buffer).setUint32(28, value, false)
    const uncompressedPublicKey = p256.getPublicKey(privateKey, false)
    if (uncompressedPublicKey[1] !== 0) continue

    const publicJwk = p256PublicKeyToJwk(uncompressedPublicKey)
    return {
      privateKey,
      jwk: {
        ...publicJwk,
        alg: 'ECDH-ES',
        x: base64UrlEncode(uncompressedPublicKey.slice(2, 33)),
      },
    }
  }
  throw new Error('TestFixtureMissingLeadingZeroCoordinate')
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

describe('jweEcdhEs', () => {
  it('round-trips A128GCM payload', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const payload = {
      vp_token: { my_credential: ['eyJhbGciOiJFUzI1NiJ9.test'] },
      state: 'session-42',
    }

    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A128GCM',
      payload,
    })

    expect(jwe.split('.').length).toBe(5)
    expect(jwe.split('.')[1]).toBe('')

    const decrypted = decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)
    expect(decrypted).toEqual(payload)
  })

  it('round-trips A256GCM payload', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const payload = { vp_token: 'raw-token' }

    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A256GCM',
      payload,
    })

    const decrypted = decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)
    expect(decrypted).toEqual(payload)
  })

  it('encrypts a short recipient coordinate only when explicitly enabled', () => {
    const { privateKey, jwk } = buildRecipientFixtureWithShortLeadingZeroXCoordinate()
    const payload = { vp_token: 'raw-token' }

    expect(() =>
      encryptCompactJweEcdhEsP256({
        recipientJwk: jwk,
        enc: 'A256GCM',
        payload,
      }),
    ).toThrow('InvalidP256JwkCoordinateLength')

    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A256GCM',
      payload,
      lenientRecipientCoordinates: true,
    })

    expect(decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)).toEqual(payload)
  })

  it('rejects oversized recipient coordinates even when leniency is enabled', () => {
    const { jwk } = buildRecipientFixture()
    const payload = { vp_token: 'raw-token' }

    expect(() =>
      encryptCompactJweEcdhEsP256({
        recipientJwk: { ...jwk, x: base64UrlEncode(new Uint8Array(33)) },
        enc: 'A256GCM',
        payload,
        lenientRecipientCoordinates: true,
      }),
    ).toThrow('InvalidP256JwkCoordinateLength')
  })

  it('rejects malformed recipient coordinates even when leniency is enabled', () => {
    const { jwk } = buildRecipientFixture()
    const payload = { vp_token: 'raw-token' }

    expect(() =>
      encryptCompactJweEcdhEsP256({
        recipientJwk: { ...jwk, x: 'invalid-coordinate' },
        enc: 'A256GCM',
        payload,
        lenientRecipientCoordinates: true,
      }),
    ).toThrow()
  })

  it('includes kid in protected header when present on recipient JWK', () => {
    const { jwk } = buildRecipientFixture()
    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A128GCM',
      payload: { vp_token: 't' },
    })

    const headerSegment = jwe.split('.')[0]!
    const headerJson = Buffer.from(
      headerSegment.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    const header = JSON.parse(headerJson) as Record<string, unknown>
    expect(header.kid).toBe('enc-1')
    expect(header.alg).toBe('ECDH-ES')
    expect(header.enc).toBe('A128GCM')
    expect(header.epk).toBeDefined()
  })
})
