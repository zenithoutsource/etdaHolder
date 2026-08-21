import type { ResolvedCredentialOffer } from '../vci/exchangeService'
import { isAuthorizationCodeOnlyOffer } from './isAuthorizationCodeOnlyOffer'

function buildOffer(overrides: Partial<ResolvedCredentialOffer>): ResolvedCredentialOffer {
  return {
    offerUri: 'openid-credential-offer://test',
    issuer: 'https://issuer.example.com',
    credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {} as ResolvedCredentialOffer['issuerMetadata'],
    credentialConfigurations: [],
    supportedFlows: [],
    version: 1,
    protocolPath: 'oid4vc',
    oid4vcContext: {
      credentialOfferObject: {
        credential_issuer: 'https://issuer.example.com',
        credential_configuration_ids: [],
        grants: { authorization_code: {} },
      },
      issuerMetadataResult: {} as ResolvedCredentialOffer['oid4vcContext']['issuerMetadataResult'],
    },
    ...overrides,
  }
}

describe('isAuthorizationCodeOnlyOffer', () => {
  test('returns true for authorization_code without pre-authorized grant', () => {
    expect(
      isAuthorizationCodeOnlyOffer(
        buildOffer({
          supportedFlows: ['authorization_code'],
        }),
      ),
    ).toBe(true)
  })

  test('returns false when pre-authorized code is present', () => {
    expect(
      isAuthorizationCodeOnlyOffer(
        buildOffer({
          supportedFlows: ['authorization_code', 'urn:ietf:params:oauth:grant-type:pre-authorized_code'],
          preAuthorizedCode: 'pre-auth-code',
        }),
      ),
    ).toBe(false)
  })

  test('returns false when supportedFlows is missing', () => {
    expect(
      isAuthorizationCodeOnlyOffer(
        buildOffer({
          supportedFlows: undefined as unknown as string[],
        }),
      ),
    ).toBe(false)
  })

  test('returns false when only pre-authorized flow is supported', () => {
    expect(
      isAuthorizationCodeOnlyOffer(
        buildOffer({
          supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
          preAuthorizedCode: 'pre-auth-code',
        }),
      ),
    ).toBe(false)
  })
})
