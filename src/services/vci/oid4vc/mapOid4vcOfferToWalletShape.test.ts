import { mapCredentialOfferObjectToWalletOffer } from './mapOid4vcOfferToWalletShape'

const preAuthOffer = {
  credential_issuer: 'https://issuer.example.com/',
  credential_configuration_ids: ['ThaiNationalID'],
  grants: {
    'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
      'pre-authorized_code': 'mock-preauth-code',
      tx_code: { input_mode: 'numeric' as const, length: 6 },
    },
  },
}

describe('mapCredentialOfferObjectToWalletOffer', () => {
  it('maps pre-authorized grant fields for wallet orchestration', () => {
    const mapped = mapCredentialOfferObjectToWalletOffer(
      'openid-credential-offer://?credential_offer=test',
      preAuthOffer,
    )

    expect(mapped.preAuthorizedCode).toBe('mock-preauth-code')
    expect(mapped.txCode).toEqual({ input_mode: 'numeric', length: 6 })
    expect(mapped.supportedFlows).toEqual(['urn:ietf:params:oauth:grant-type:pre-authorized_code'])
    expect(mapped.credential_offer?.credential_configuration_ids).toEqual(['ThaiNationalID'])
    expect(mapped.credential_offer?.credential_issuer).toBe('https://issuer.example.com/')
  })
})
