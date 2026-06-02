import { resolveOffer, type ResolvedCredentialOffer } from './exchangeService'

const offerUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22ThaiNationalID%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%2C%22tx_code%22%3A%7B%22input_mode%22%3A%22numeric%22%2C%22length%22%3A6%7D%7D%7D%7D'

async function contract(): Promise<ResolvedCredentialOffer> {
  return resolveOffer(offerUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiNationalID: {
          format: 'jwt_vc_json',
          credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
      display: [{ name: 'Example Issuer', locale: 'en' }],
    }),
  })
}

void contract()
