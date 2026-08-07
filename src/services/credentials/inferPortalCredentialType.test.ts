import type { ResolvedCredentialOffer } from '../vci/exchangeService'
import { inferPortalCredentialTypeFromOffer } from './inferPortalCredentialType'

function buildOffer(configurationIds: string[]): ResolvedCredentialOffer {
  return {
    offerUri: 'openid-credential-offer://test',
    issuer: 'https://issuer.example.com',
    credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {} as ResolvedCredentialOffer['issuerMetadata'],
    credentialConfigurations: configurationIds.map((id) => ({
      id,
      requestId: id,
      format: 'dc+sd-jwt' as const,
      rawConfiguration: { format: 'dc+sd-jwt' },
    })),
    supportedFlows: ['authorization_code'],
    version: 1,
    protocolPath: 'oid4vc',
    oid4vcContext: {
      credentialOfferObject: {
        credential_issuer: 'https://issuer.example.com',
        credential_configuration_ids: configurationIds,
        grants: { authorization_code: {} },
      },
      issuerMetadataResult: {} as ResolvedCredentialOffer['oid4vcContext']['issuerMetadataResult'],
    },
  }
}

describe('inferPortalCredentialTypeFromOffer', () => {
  test('maps ThaID configuration id', () => {
    expect(
      inferPortalCredentialTypeFromOffer(buildOffer(['IDCard_dc+sd-jwt'])),
    ).toBe('ThaiNationalID')
  })

  test('maps driving licence when mdoc configuration is present', () => {
    expect(
      inferPortalCredentialTypeFromOffer(
        buildOffer(['Iso18013DriversLicenseCredential_dc+sd-jwt', 'org.iso.18013.5.1.mDL']),
      ),
    ).toBe('DLTDrivingLicence')
  })

  test('returns undefined for unknown configuration ids', () => {
    expect(inferPortalCredentialTypeFromOffer(buildOffer(['UnknownCredential']))).toBeUndefined()
  })
})
