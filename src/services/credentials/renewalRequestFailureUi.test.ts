import { WALLET_HOME_COPY } from './walletHomeCopy'
import {
  buildRenewalRequestFailureDialog,
  resolveRenewalRequestFailureUi,
} from './renewalRequestFailureUi'

describe('resolveRenewalRequestFailureUi', () => {
  test('maps previous-key unavailable without a portal fallback', () => {
    expect(
      resolveRenewalRequestFailureUi(
        new Error('CredentialRenewalPreviousKeyUnavailable: did:key:old'),
      ),
    ).toEqual({
      kind: 'previous-key-unavailable',
      title: WALLET_HOME_COPY.renewalKeyUnavailableTitle,
      message: WALLET_HOME_COPY.renewalKeyUnavailableMessage,
      offerPortalFallback: false,
    })
  })

  test('maps HTTP 502 and 503 as Issuer offer failures with portal fallback', () => {
    expect(
      resolveRenewalRequestFailureUi(new Error('CredentialRenewalRequestFailed: HTTP 502')),
    ).toEqual({
      kind: 'issuer-offer-failed',
      title: WALLET_HOME_COPY.renewalIssuerOfferFailedTitle,
      message: WALLET_HOME_COPY.renewalIssuerOfferFailedMessage,
      offerPortalFallback: true,
    })
    expect(
      resolveRenewalRequestFailureUi(new Error('CredentialRenewalRequestFailed: HTTP 503')),
    ).toMatchObject({
      kind: 'issuer-offer-failed',
      offerPortalFallback: true,
    })
  })

  test('maps other failures to generic retry without portal fallback', () => {
    expect(
      resolveRenewalRequestFailureUi(new Error('CredentialRenewalRequestFailed: HTTP 500')),
    ).toEqual({
      kind: 'generic',
      title: WALLET_HOME_COPY.renewalRequestFailedTitle,
      message: WALLET_HOME_COPY.renewalRequestFailedMessage,
      offerPortalFallback: false,
    })
  })
})

describe('buildRenewalRequestFailureDialog', () => {
  test('adds ขอเอกสารใหม่ only when the Issuer stub failed and a portal handler is provided', () => {
    const onRequestNewCredential = jest.fn()
    const dialog = buildRenewalRequestFailureDialog(
      new Error('CredentialRenewalRequestFailed: HTTP 502'),
      { onRequestNewCredential },
    )

    expect(dialog.title).toBe(WALLET_HOME_COPY.renewalIssuerOfferFailedTitle)
    expect(dialog.actions).toEqual([
      { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
      {
        label: WALLET_HOME_COPY.requestNewCredential,
        onPress: onRequestNewCredential,
      },
    ])
  })

  test('omits portal CTA when no handler is provided', () => {
    const dialog = buildRenewalRequestFailureDialog(
      new Error('CredentialRenewalRequestFailed: HTTP 502'),
    )

    expect(dialog.actions).toEqual([
      { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
    ])
  })
})
