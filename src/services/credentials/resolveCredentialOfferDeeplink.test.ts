import { resolveCredentialOfferDeeplink } from './resolveCredentialOfferDeeplink'

describe('resolveCredentialOfferDeeplink', () => {
  test('returns direct openid-credential-offer deeplinks unchanged', () => {
    const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    expect(resolveCredentialOfferDeeplink(offer)).toBe(offer)
  })

  test('unwraps walletapp callback portal returns', () => {
    const callback =
      'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Db30353bd-c066-4d73-9d2f-ff6f1f02798e'

    expect(resolveCredentialOfferDeeplink(callback)).toBe(
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Db30353bd-c066-4d73-9d2f-ff6f1f02798e',
    )
  })

  test('returns null for unrelated deeplinks', () => {
    expect(resolveCredentialOfferDeeplink('walletapp://callback?code=abc')).toBeNull()
    expect(resolveCredentialOfferDeeplink(null)).toBeNull()
  })
})
