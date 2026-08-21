import { parseCredentialOfferViaOid4vc } from './parseCredentialOfferViaOid4vc'

describe('openid4vci Hermes smoke', () => {
  it('parses a by-value pre-authorized credential offer URI', async () => {
    const uri = `openid-credential-offer://?${new URLSearchParams({
      credential_offer: JSON.stringify({
        credential_issuer: 'https://issuer.example.com',
        credential_configuration_ids: ['ThaiNationalID'],
        grants: {
          'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
            'pre-authorized_code': 'mock-preauth-code',
          },
        },
      }),
    }).toString()}`

    const parsed = await parseCredentialOfferViaOid4vc(uri)

    expect(parsed.credentialOfferObject.credential_issuer).toBe('https://issuer.example.com')
    expect(parsed.credentialOfferObject.credential_configuration_ids).toEqual(['ThaiNationalID'])
    expect(parsed.oid4vcContext.credentialOfferObject).toEqual(parsed.credentialOfferObject)
  })
})
