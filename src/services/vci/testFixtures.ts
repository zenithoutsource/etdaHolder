import type { Oid4vcVciAdapterContext } from './oid4vc/types'

export function makeTestOid4vcContext(
  issuer = 'https://issuer.example.com',
  configurationIds: string[] = ['ThaiNationalID'],
): Oid4vcVciAdapterContext {
  const normalized = issuer.replace(/\/$/, '')
  return {
    credentialOfferObject: {
      credential_issuer: normalized as never,
      credential_configuration_ids: configurationIds,
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': 'preauth-code',
        },
      },
    },
    issuerMetadataResult: {
      credentialIssuer: { credential_issuer: normalized },
      credentialEndpoint: `${normalized}/credential`,
    } as unknown as Oid4vcVciAdapterContext['issuerMetadataResult'],
  }
}
