import {
  describeIssuanceCallbackForLog,
  describeIssuanceCallbackSearchParamsForLog,
} from './describeIssuanceCallbackForLog'

describe('describeIssuanceCallbackForLog', () => {
  test('summarizes walletapp callback with https offer uri without leaking full url', () => {
    const summary = describeIssuanceCallbackForLog(
      'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Dsecret-id',
    )

    expect(summary).toMatchObject({
      scheme: 'walletapp',
      host: 'callback',
      queryKeys: ['credential_offer_uri'],
      hasCredentialOfferUri: true,
      hasCode: false,
      offerUriScheme: 'https',
      offerUriHost: 'issuer.example:455',
      offerUriPath: '/openid4vc/credentialOffer',
    })
    expect(JSON.stringify(summary)).not.toContain('secret-id')
  })

  test('summarizes empty / missing url', () => {
    expect(describeIssuanceCallbackForLog(null).rawUrlBytes).toBe(0)
    expect(describeIssuanceCallbackForLog(undefined).queryKeys).toEqual([])
  })
})

describe('describeIssuanceCallbackSearchParamsForLog', () => {
  test('summarizes expo router search params', () => {
    expect(
      describeIssuanceCallbackSearchParamsForLog({
        credential_offer_uri: 'https://issuer.example/offer',
      }),
    ).toMatchObject({
      scheme: 'expo-router',
      queryKeys: ['credential_offer_uri'],
      hasCredentialOfferUri: true,
      offerUriHost: 'issuer.example',
      offerUriPath: '/offer',
    })
  })
})
