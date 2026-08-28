import { p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { Buffer } from '@craftzdog/react-native-buffer'
import { createDecipheriv } from 'react-native-quick-crypto'

import { p256JwkToPublicKey, p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'
import type { EcP256Jwk } from '@/src/services/crypto/hardwareEcdsaTypes'

import {
  decryptCompactJweEcdhEsP256ForTest,
  deriveEcdhEsContentKeyForTest,
  encryptCompactJweEcdhEsP256,
  type Oid4vpEncryptionRecipientJwk,
} from './jweEcdhEs'

/**
 * RFC 7518 Appendix C — "Example ECDH-ES Key Agreement Computation".
 * Pins the shared-secret derivation (x-coordinate only) and the Concat KDF with
 * apu/apv. A round-trip test cannot catch a symmetric derivation defect.
 */
const RFC7518_APPENDIX_C = {
  aliceEphemeral: {
    x: 'gI0GAILBdu7T53akrFmMyGcsF3n5dO7MmwNBHKW5SV0',
    y: 'SLW_xSffzlPWrHEVI30DHM_4egVwt3NQqeUD7nMFpps',
    d: '0_NxaRPUMQoAJt50Gz8YiTr8gRTwyEaCumd-MToTmIo',
  },
  bob: {
    x: 'weNJy2HscCSM6AEDTDg04biOvhFhyyWvOHQfeF_PxMQ',
    y: 'e8lnCO-AlStT-NJVX-crhB7QRYhiix03illJOVAOyck',
    d: 'VEmDZpDXXK8p8N0Cndsxs924q6nS1RXFASRl6BfUqdw',
  },
  apu: 'QWxpY2U',
  apv: 'Qm9i',
  expectedDerivedKey: 'VqqN6vgjbSBcIijNcacQGg',
} as const

function decodeBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function uint32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, false)
  return out
}

function lengthPrefixed(value: Uint8Array): Uint8Array {
  return concat([uint32(value.length), value])
}

function deriveRfc7518Key(
  sharedSecret: Uint8Array,
  enc: 'A128GCM' | 'A256GCM',
  apu: Uint8Array,
  apv: Uint8Array,
): Uint8Array {
  const keyBits = enc === 'A128GCM' ? 128 : 256
  const otherInfo = concat([
    lengthPrefixed(new TextEncoder().encode(enc)),
    lengthPrefixed(apu),
    lengthPrefixed(apv),
    uint32(keyBits),
  ])
  return sha256(concat([uint32(1), sharedSecret, otherInfo])).slice(0, keyBits / 8)
}

function decryptWithRfc7518Jwe(compactJwe: string, recipientPrivateKey: Uint8Array): Record<string, unknown> {
  const segments = compactJwe.split('.')
  const header = JSON.parse(Buffer.from(segments[0]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>
  const epk = header.epk as EcP256Jwk
  const sharedPoint = p256.getSharedSecret(recipientPrivateKey, p256JwkToPublicKey(epk), false)
  const sharedSecret = sharedPoint.slice(1, 33)
  const enc = header.enc as 'A128GCM' | 'A256GCM'
  const decodeB64Url = (value: string) =>
    Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const apu = typeof header.apu === 'string' ? new Uint8Array(decodeB64Url(header.apu)) : new Uint8Array(0)
  const apv = typeof header.apv === 'string' ? new Uint8Array(decodeB64Url(header.apv)) : new Uint8Array(0)
  const key = deriveRfc7518Key(sharedSecret, enc, apu, apv)
  const decode = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const decipher = createDecipheriv(enc === 'A128GCM' ? 'aes-128-gcm' : 'aes-256-gcm', Buffer.from(key), decode(segments[2]!))
  decipher.setAAD(Buffer.from(segments[0]!))
  decipher.setAuthTag(decode(segments[4]!))
  const plaintext = Buffer.concat([decipher.update(decode(segments[3]!)), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>
}

describe('jweEcdhEs', () => {
  it('matches the RFC 7518 Appendix C ECDH-ES derived key', () => {
    const bobPublicKey = p256JwkToPublicKey({
      kty: 'EC',
      crv: 'P-256',
      x: RFC7518_APPENDIX_C.bob.x,
      y: RFC7518_APPENDIX_C.bob.y,
    } as EcP256Jwk)

    const derived = deriveEcdhEsContentKeyForTest({
      privateKey: decodeBase64Url(RFC7518_APPENDIX_C.aliceEphemeral.d),
      peerPublicKey: bobPublicKey,
      enc: 'A128GCM',
      agreementParties: {
        partyUInfo: decodeBase64Url(RFC7518_APPENDIX_C.apu),
        partyVInfo: decodeBase64Url(RFC7518_APPENDIX_C.apv),
      },
    })

    expect(encodeBase64Url(derived)).toBe(RFC7518_APPENDIX_C.expectedDerivedKey)
  })

  it('derives the RFC 7518 Appendix C key from either side of the agreement', () => {
    const alicePublicKey = p256JwkToPublicKey({
      kty: 'EC',
      crv: 'P-256',
      x: RFC7518_APPENDIX_C.aliceEphemeral.x,
      y: RFC7518_APPENDIX_C.aliceEphemeral.y,
    } as EcP256Jwk)

    const derived = deriveEcdhEsContentKeyForTest({
      privateKey: decodeBase64Url(RFC7518_APPENDIX_C.bob.d),
      peerPublicKey: alicePublicKey,
      enc: 'A128GCM',
      agreementParties: {
        partyUInfo: decodeBase64Url(RFC7518_APPENDIX_C.apu),
        partyVInfo: decodeBase64Url(RFC7518_APPENDIX_C.apv),
      },
    })

    expect(encodeBase64Url(derived)).toBe(RFC7518_APPENDIX_C.expectedDerivedKey)
  })

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

  it('round-trips OID4VP DCQL object_array envelope', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const queryId = 'a6d72bee-617c-4670-8b18-3b015eb22088'
    const state = '8ae9ba73-9061-4391-af2a-b7d9d0004a09'
    const payload = {
      vp_token: { [queryId]: ['issuer.jwt~disc~kb.jwt'] },
      state,
    }

    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A128GCM',
      payload,
    })

    const decrypted = decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)
    expect(decrypted).toEqual(payload)
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

  it('includes apv in protected header and KDF when authorization nonce is provided', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const nonce = '3Y_PbdpMZBeR5hbFbAM4LbpXL0VMBdhM0Vf-cqJ1YVs'
    const payload = { vp_token: { query: ['issuer.jwt~disc~kb.jwt'] }, state: 'state-1' }
    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A128GCM',
      payload,
      agreementParties: { partyVInfo: new TextEncoder().encode(nonce) },
    })

    const headerSegment = jwe.split('.')[0]!
    const header = JSON.parse(
      Buffer.from(headerSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as Record<string, unknown>
    expect(header.apv).toBeTruthy()
    expect(decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)).toEqual(payload)
    expect(decryptWithRfc7518Jwe(jwe, privateKey)).toEqual(payload)
  })

  it('is decryptable by an independent RFC 7518 ECDH-ES implementation', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const payload = { vp_token: { query: ['issuer.jwt~disc~kb.jwt'] }, state: 'state-1' }
    const jwe = encryptCompactJweEcdhEsP256({ recipientJwk: jwk, enc: 'A128GCM', payload })

    expect(decryptWithRfc7518Jwe(jwe, privateKey)).toEqual(payload)
  })
})
