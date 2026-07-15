import {
  shouldNavigateInactiveCredentialToDetail,
  shouldShowReadyRenewalReceiveCta,
} from './credentialHomeNavigation'
import type { CredentialInactiveState } from './credentialInactiveState'

function inactiveState(
  kind: Extract<CredentialInactiveState, { kind: Exclude<CredentialInactiveState['kind'], 'active'> }>['kind'],
): CredentialInactiveState {
  return {
    kind,
    badgeLabel: 'Inactive',
    badgeClassName: 'bg-gray-badge',
    panelMessage: 'test',
  }
}

describe('credentialHomeNavigation', () => {
  test('keeps ready renewals expandable on Home but routes other processing renewals to detail', () => {
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('renewal-processing'), {
        renewalStatus: { state: 'renewal-processing' },
      }),
    ).toBe(true)
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('renewal-processing'), {
        renewalStatus: {
          state: 'renewal-processing',
          readyOfferUri: '  openid-credential-offer://ready  ',
        },
      }),
    ).toBe(false)
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('document-expired')),
    ).toBe(true)
  })

  test('navigates issuer-suspended credentials to detail for acknowledgment and delete actions', () => {
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('issuer-suspended')),
    ).toBe(true)
  })

  test('keeps other inactive credentials on the home expanded panel', () => {
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('renewal-required')),
    ).toBe(false)
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('cleanup-pending')),
    ).toBe(false)
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('revoked')),
    ).toBe(false)
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('deleted')),
    ).toBe(false)
  })

  test('shows the Home receive CTA only for an expanded ready renewal', () => {
    expect(
      shouldShowReadyRenewalReceiveCta(true, {
        state: 'renewal-processing',
        readyOfferUri: '  openid-credential-offer://ready  ',
      }),
    ).toBe(true)
    expect(
      shouldShowReadyRenewalReceiveCta(true, {
        state: 'renewal-processing',
      }),
    ).toBe(false)
    expect(
      shouldShowReadyRenewalReceiveCta(true, {
        state: 'renewal-required',
        readyOfferUri: 'openid-credential-offer://ready',
      }),
    ).toBe(false)
  })
})
