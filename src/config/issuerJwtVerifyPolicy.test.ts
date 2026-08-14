import {
  assertTrustedVerifyAlg,
  formatTrustedVerifyAlgs,
  isTrustedIssuerJwtAlg,
  readPeerAdvertisedVerifyAlgs,
  resolveTrustedVerifyAlgs,
  TRUSTED_ISSUER_JWT_ALGS,
} from './issuerJwtVerifyPolicy'

describe('issuerJwtVerifyPolicy', () => {
  test('trusted base is ES256 and EdDSA', () => {
    expect(TRUSTED_ISSUER_JWT_ALGS).toEqual(['ES256', 'EdDSA'])
    expect(isTrustedIssuerJwtAlg('ES256')).toBe(true)
    expect(isTrustedIssuerJwtAlg('EdDSA')).toBe(true)
    expect(isTrustedIssuerJwtAlg('RS256')).toBe(false)
  })

  test('resolveTrustedVerifyAlgs uses the full base when metadata is absent', () => {
    expect(resolveTrustedVerifyAlgs()).toEqual(['ES256', 'EdDSA'])
    expect(resolveTrustedVerifyAlgs(null)).toEqual(['ES256', 'EdDSA'])
    expect(resolveTrustedVerifyAlgs([])).toEqual(['ES256', 'EdDSA'])
  })

  test('metadata may narrow the trusted base', () => {
    expect(resolveTrustedVerifyAlgs(['ES256'])).toEqual(['ES256'])
    expect(resolveTrustedVerifyAlgs(['EdDSA', 'ES256', 'EdDSA'])).toEqual(['EdDSA', 'ES256'])
  })

  test('metadata cannot expand beyond the trusted base', () => {
    expect(resolveTrustedVerifyAlgs(['ES256', 'RS256', 'none'])).toEqual(['ES256'])
  })

  test('metadata that advertises only untrusted algs fails closed', () => {
    expect(() => resolveTrustedVerifyAlgs(['RS256'])).toThrow('VerifyAlgAllowlistEmpty')
  })

  test('assertTrustedVerifyAlg keeps the existing unsupported-alg copy on the full base', () => {
    expect(() => assertTrustedVerifyAlg('RS256')).toThrow(
      'CredentialSignatureAlgUnsupported: issuer credential alg must be ES256 or EdDSA, got RS256',
    )
  })

  test('assertTrustedVerifyAlg rejects a trusted alg that metadata narrowed away', () => {
    expect(() => assertTrustedVerifyAlg('EdDSA', ['ES256'])).toThrow(
      'CredentialSignatureAlgUnsupported: issuer credential alg must be ES256, got EdDSA',
    )
  })

  test('formatTrustedVerifyAlgs joins two algs with or', () => {
    expect(formatTrustedVerifyAlgs(['ES256', 'EdDSA'])).toBe('ES256 or EdDSA')
  })

  test('readPeerAdvertisedVerifyAlgs collects issuer and JAR fields', () => {
    expect(
      readPeerAdvertisedVerifyAlgs({
        credential_signing_alg_values_supported: ['ES256'],
        request_object_signing_alg_values_supported: ['EdDSA'],
        credential_configurations_supported: {
          mdl: { credential_signing_alg_values_supported: ['ES256', 'RS256'] },
        },
      }),
    ).toEqual(['ES256', 'EdDSA', 'ES256', 'RS256'])
  })

  test('readPeerAdvertisedVerifyAlgs returns undefined when the peer advertised none', () => {
    expect(readPeerAdvertisedVerifyAlgs(undefined)).toBeUndefined()
    expect(readPeerAdvertisedVerifyAlgs({ issuer: 'https://example.invalid' })).toBeUndefined()
  })
})
