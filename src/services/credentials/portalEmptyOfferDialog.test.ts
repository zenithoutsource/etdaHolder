import {
  buildPortalEmptyOfferDialogFromReturn,
  buildPortalEmptyOfferDialogOptions,
} from './portalEmptyOfferDialog'
import type { IssuanceCallbackLogSummary } from './describeIssuanceCallbackForLog'
import { WALLET_HOME_COPY } from './walletHomeCopy'

const emptyCallbackSummary: IssuanceCallbackLogSummary = {
  scheme: 'walletapp',
  host: 'callback',
  pathname: '/',
  queryKeys: [],
  hasCredentialOfferUri: false,
  hasCredentialOfferJson: false,
  hasCode: false,
  offerUriScheme: null,
  offerUriHost: null,
  offerUriPath: null,
  looksLikeOpenIdCredentialOffer: false,
  rawUrlBytes: 0,
}

describe('portalEmptyOfferDialog', () => {
  test('uses warning tone and retry action when issuer returns without offer', () => {
    const onRetry = jest.fn()
    const options = buildPortalEmptyOfferDialogOptions({
      reason: 'no_offer_in_callback',
      onRetry,
    })

    expect(options.icon).toBe('warning')
    expect(options.title).toBe(WALLET_HOME_COPY.portalEmptyOfferTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.portalEmptyOfferMessage)
    expect(options.actions).toEqual([
      { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
      { label: WALLET_HOME_COPY.portalEmptyOfferRetry, onPress: onRetry },
    ])
  })

  test('uses no-callback copy when app never receives a portal redirect', () => {
    const options = buildPortalEmptyOfferDialogOptions({
      reason: 'no_callback',
      onRetry: jest.fn(),
    })

    expect(options.title).toBe(WALLET_HOME_COPY.portalNoCallbackTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.portalNoCallbackMessage)
  })

  test('maps last portal return outcomes to user-facing reasons', () => {
    const options = buildPortalEmptyOfferDialogFromReturn({
      record: {
        at: Date.now(),
        source: 'android-fallback',
        summary: emptyCallbackSummary,
        outcome: 'empty-callback',
      },
      onRetry: jest.fn(),
    })

    expect(options.title).toBe(WALLET_HOME_COPY.portalEmptyOfferTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.portalEmptyOfferMessage)
  })
})
