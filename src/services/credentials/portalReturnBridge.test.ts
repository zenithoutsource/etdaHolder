import {
  beginPortalReturnCapture,
  endPortalReturnCapture,
  isPortalReturnUrlIgnoredDuringCapture,
  notifyPortalReturnUrl,
  readLastNotifiedPortalReturnUrl,
} from './portalReturnBridge'

describe('portalReturnBridge stale callback guard', () => {
  afterEach(() => {
    endPortalReturnCapture()
  })

  test('ignores the baseline callback URL and its normalized offer during capture', () => {
    const returnUrl = 'walletapp://callback'
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fprevious'
    const callbackUrl = 'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fprevious'

    beginPortalReturnCapture({
      ignoredUrls: [callbackUrl],
      ignoredUris: [offerUri],
    })

    expect(isPortalReturnUrlIgnoredDuringCapture(callbackUrl, returnUrl)).toBe(true)
    expect(isPortalReturnUrlIgnoredDuringCapture(offerUri, returnUrl)).toBe(true)
  })

  test('accepts a new callback while capture is active and after capture ends', () => {
    const returnUrl = 'walletapp://callback'
    const newOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fnew'

    beginPortalReturnCapture({
      ignoredUrls: ['walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fprevious'],
      ignoredUris: ['openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fprevious'],
    })

    expect(isPortalReturnUrlIgnoredDuringCapture(newOfferUri, returnUrl)).toBe(false)

    endPortalReturnCapture()

    expect(isPortalReturnUrlIgnoredDuringCapture(newOfferUri, returnUrl)).toBe(false)
  })

  test('notifyPortalReturnUrl drops stale callbacks during capture', () => {
    const callbackUrl = 'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fprevious'

    beginPortalReturnCapture({ ignoredUrls: [callbackUrl] })

    notifyPortalReturnUrl(callbackUrl, 'test')

    expect(readLastNotifiedPortalReturnUrl()).toBeUndefined()
  })
})
