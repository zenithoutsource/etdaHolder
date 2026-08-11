import {
  beginPortalReturnCapture,
  endPortalReturnCapture,
  isPortalReturnUrlIgnoredDuringCapture,
  notifyPortalReturnUrl,
  readLastNotifiedPortalReturnUrl,
  readPortalReturnCaptureGeneration,
  waitForPortalReturnNotification,
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

  test('a newer beginPortalReturnCapture supersedes an in-flight wait', async () => {
    const firstGeneration = beginPortalReturnCapture()
    const firstWait = waitForPortalReturnNotification(5_000, {
      captureGeneration: firstGeneration,
    })

    const secondGeneration = beginPortalReturnCapture()
    expect(secondGeneration).toBeGreaterThan(firstGeneration)
    expect(readPortalReturnCaptureGeneration()).toBe(secondGeneration)

    await expect(firstWait).resolves.toBeUndefined()

    const offerUrl = 'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fnew'
    const secondWait = waitForPortalReturnNotification(5_000, {
      captureGeneration: secondGeneration,
    })
    notifyPortalReturnUrl(offerUrl, 'test')
    await expect(secondWait).resolves.toBe(offerUrl)
  })

  test('endPortalReturnCapture ignores a stale generation from an older portal open', () => {
    const firstGeneration = beginPortalReturnCapture()
    const secondGeneration = beginPortalReturnCapture()

    endPortalReturnCapture(firstGeneration)

    expect(readPortalReturnCaptureGeneration()).toBe(secondGeneration)
    expect(
      isPortalReturnUrlIgnoredDuringCapture(
        'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fold',
        'walletapp://callback',
      ),
    ).toBe(false)
  })
})
