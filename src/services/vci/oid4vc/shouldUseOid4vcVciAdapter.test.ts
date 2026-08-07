import { shouldUseOid4vcVciAdapter, buildAuthorizationCodeCredentialOfferObject } from './shouldUseOid4vcVciAdapter'

const preAuthOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22ThaiNationalID%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'

const dualFormatOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22org.iso.18013.5.1.mDL%22%2C%22Iso18013DriversLicenseCredential_dc%2Bsd-jwt%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'

describe('shouldUseOid4vcVciAdapter', () => {
  it('returns true for single-config pre-authorized offer', () => {
    expect(shouldUseOid4vcVciAdapter({ offerUri: preAuthOfferUri })).toBe(true)
  })

  it('returns true for dual-format pre-authorized offers', () => {
    expect(shouldUseOid4vcVciAdapter({ offerUri: dualFormatOfferUri })).toBe(true)
  })

  it('returns true for authorization-code-only synthetic offers', () => {
    expect(
      shouldUseOid4vcVciAdapter({
        credentialOfferObject: buildAuthorizationCodeCredentialOfferObject({
          issuer: 'https://issuer.example.com',
          credentialConfigurationIds: ['ThaiNationalID'],
        }),
      }),
    ).toBe(true)
  })

  it('returns true for credential_offer_uri-only offers', () => {
    expect(
      shouldUseOid4vcVciAdapter({
        offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example.com%2Foffer',
      }),
    ).toBe(true)
  })

  it('returns false when grants or configuration ids are missing', () => {
    expect(
      shouldUseOid4vcVciAdapter({
        credentialOfferObject: {
          credential_issuer: 'https://issuer.example.com',
          credential_configuration_ids: [],
          grants: {},
        } as never,
      }),
    ).toBe(false)
  })
})
