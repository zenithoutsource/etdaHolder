import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'

import {
  resolveOid4vpResponseEncryptionParams,
  isSupportedOid4vpResponseMode,
} from './oid4vpResponseEncryption'

const recipientJwk = {
  kty: 'EC',
  crv: 'P-256',
  alg: 'ECDH-ES',
  kid: 'enc-1',
  use: 'enc',
  x: 'YO4epjifD-KWeq1sL2tNmm36BhXnkJ0He-WqMYrp9Fk',
  y: 'Hekpm0zfK7C-YccH5iBjcIXgf6YdUvNUac_0At55Okk',
}

function buildRecipientWithShortLeadingZeroXCoordinate() {
  for (let value = 1; value < 4096; value += 1) {
    const privateKey = new Uint8Array(32)
    new DataView(privateKey.buffer).setUint32(28, value, false)
    const uncompressedPublicKey = p256.getPublicKey(privateKey, false)
    if (uncompressedPublicKey[1] !== 0) continue

    return {
      ...p256PublicKeyToJwk(uncompressedPublicKey),
      alg: 'ECDH-ES',
      kid: 'short-coordinate',
      use: 'enc',
      x: base64UrlEncode(uncompressedPublicKey.slice(2, 33)),
    }
  }
  throw new Error('TestFixtureMissingLeadingZeroCoordinate')
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

describe('oid4vpResponseEncryption', () => {
  const originalOid4vpJweEnc = process.env.EXPO_PUBLIC_OID4VP_JWE_ENC
  const originalWalletDemoInterop = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  afterEach(() => {
    process.env.EXPO_PUBLIC_OID4VP_JWE_ENC = originalOid4vpJweEnc
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalWalletDemoInterop
  })

  it('accepts supported response modes', () => {
    expect(isSupportedOid4vpResponseMode('direct_post')).toBe(true)
    expect(isSupportedOid4vpResponseMode('direct_post.jwt')).toBe(true)
    expect(isSupportedOid4vpResponseMode('fragment')).toBe(false)
    expect(isSupportedOid4vpResponseMode('dc_api')).toBe(false)
    expect(isSupportedOid4vpResponseMode('dc_api.jwt')).toBe(false)
  })

  it('selects first usable P-256 ECDH-ES key and default A128GCM', () => {
    const params = resolveOid4vpResponseEncryptionParams({
      client_metadata: {
        jwks: { keys: [recipientJwk] },
      },
    })

    expect(params.alg).toBe('ECDH-ES')
    expect(params.enc).toBe('A128GCM')
    expect(params.jwk.kid).toBe('enc-1')
  })

  it('prefers first supported enc from encrypted_response_enc_values_supported', () => {
    const params = resolveOid4vpResponseEncryptionParams({
      client_metadata: {
        jwks: { keys: [recipientJwk] },
        encrypted_response_enc_values_supported: ['A256GCM', 'A128GCM'],
      },
    })

    expect(params.enc).toBe('A256GCM')
  })

  it('uses the A256GCM dev override when the verifier advertises it', () => {
    process.env.EXPO_PUBLIC_OID4VP_JWE_ENC = 'A256GCM'

    const params = resolveOid4vpResponseEncryptionParams({
      client_metadata: {
        jwks: { keys: [recipientJwk] },
        encrypted_response_enc_values_supported: ['A128GCM', 'A256GCM'],
      },
    })

    expect(params.enc).toBe('A256GCM')
  })

  it('records padding used for a verifier encryption JWK in demo interop', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    const params = resolveOid4vpResponseEncryptionParams({
      client_metadata: {
        jwks: { keys: [buildRecipientWithShortLeadingZeroXCoordinate()] },
      },
    })

    expect(params.jwkCoordinatePadded).toBe(true)
  })

  it('ignores the A256GCM dev override when the verifier does not advertise it', () => {
    process.env.EXPO_PUBLIC_OID4VP_JWE_ENC = 'A256GCM'

    const params = resolveOid4vpResponseEncryptionParams({
      client_metadata: {
        jwks: { keys: [recipientJwk] },
        encrypted_response_enc_values_supported: ['A128GCM'],
      },
    })

    expect(params.enc).toBe('A128GCM')
  })

  it('rejects oversized verifier encryption coordinates in demo interop', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(() =>
      resolveOid4vpResponseEncryptionParams({
        client_metadata: {
          jwks: {
            keys: [{ ...recipientJwk, x: base64UrlEncode(new Uint8Array(33)) }],
          },
        },
      }),
    ).toThrow('InvalidP256JwkCoordinateLength')
  })

  it('rejects malformed verifier encryption coordinates in demo interop', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(() =>
      resolveOid4vpResponseEncryptionParams({
        client_metadata: {
          jwks: { keys: [{ ...recipientJwk, x: 'invalid-coordinate' }] },
        },
      }),
    ).toThrow()
  })

  it('throws when client_metadata is missing', () => {
    expect(() => resolveOid4vpResponseEncryptionParams({})).toThrow(
      'PresentationRequestUnsupported: direct_post.jwt requires client_metadata with jwks.keys',
    )
  })

  it('throws when no usable encryption key exists', () => {
    expect(() =>
      resolveOid4vpResponseEncryptionParams({
        client_metadata: {
          jwks: {
            keys: [{ kty: 'RSA', alg: 'RSA-OAEP', use: 'enc' }],
          },
        },
      }),
    ).toThrow(
      'PresentationRequestUnsupported: direct_post.jwt requires an EC P-256 ECDH-ES encryption JWK',
    )
  })

  it('parses string client_metadata JSON', () => {
    const params = resolveOid4vpResponseEncryptionParams({
      client_metadata: JSON.stringify({
        jwks: { keys: [recipientJwk] },
      }),
    })

    expect(params.jwk.x).toBe(recipientJwk.x)
  })
})
