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

describe('oid4vpResponseEncryption', () => {
  it('accepts supported response modes', () => {
    expect(isSupportedOid4vpResponseMode('direct_post')).toBe(true)
    expect(isSupportedOid4vpResponseMode('direct_post.jwt')).toBe(true)
    expect(isSupportedOid4vpResponseMode('fragment')).toBe(false)
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
