import {
  shouldBlockCredentialDetailPresentment,
  shouldNavigateInactiveCredentialToDetail,
  shouldShowInactivePortalRequestCta,
  shouldShowReadyRenewalReceiveCta,
  shouldSplitSuspendedHomeRow,
} from './credentialHomeNavigation'
import type { CredentialInactiveState } from './credentialInactiveState'
import { isStoredCredentialKeyTtlExpired } from './credentialKeyExpiry'

jest.mock('./credentialKeyExpiry', () => ({
  isStoredCredentialKeyTtlExpired: jest.fn(() => false),
}))

const isStoredCredentialKeyTtlExpiredMock = isStoredCredentialKeyTtlExpired as jest.MockedFunction<
  typeof isStoredCredentialKeyTtlExpired
>

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
  beforeEach(() => {
    isStoredCredentialKeyTtlExpiredMock.mockReset()
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(false)
  })
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
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('hardware-reissue-required')),
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

  test('shows a portal request CTA for hardware-reissue-required credentials', () => {
    expect(shouldShowInactivePortalRequestCta(inactiveState('hardware-reissue-required'))).toBe(
      true,
    )
    expect(shouldShowInactivePortalRequestCta(inactiveState('document-expired'))).toBe(true)
    expect(shouldShowInactivePortalRequestCta(inactiveState('renewal-required'))).toBe(false)
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

  test('splits home tap for inactive rows including P3 renewal states', () => {
    expect(shouldSplitSuspendedHomeRow(inactiveState('issuer-suspended'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('revoked'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('document-expired'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('hardware-reissue-required'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('renewal-required'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('renewal-processing'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('cleanup-pending'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow(inactiveState('old-revoked'))).toBe(true)
    expect(shouldSplitSuspendedHomeRow({ kind: 'active' })).toBe(false)
  })

  test('blocks My QR and NFC on withdrawn and other non-presentable detail states', () => {
    expect(shouldBlockCredentialDetailPresentment(inactiveState('issuer-suspended'))).toBe(true)
    expect(shouldBlockCredentialDetailPresentment(inactiveState('revoked'))).toBe(true)
    expect(shouldBlockCredentialDetailPresentment(inactiveState('renewal-required'))).toBe(true)
    expect(shouldBlockCredentialDetailPresentment(inactiveState('document-expired'))).toBe(true)
    expect(shouldBlockCredentialDetailPresentment({ kind: 'active' })).toBe(false)
  })

  test('blocks My QR and NFC when renewed-active k_cred TTL has elapsed', () => {
    const credential = {
      id: 'transcript-new',
      type: 'ChulalongkornUniversityTranscript',
      claims: {},
      expiresAt: '2030-06-15T00:00:00.000Z',
    }
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(true)

    expect(shouldBlockCredentialDetailPresentment({ kind: 'active' }, credential)).toBe(true)
  })

  test('keeps My QR and NFC when renewed-active k_cred TTL has not elapsed', () => {
    const credential = {
      id: 'transcript-new',
      type: 'ChulalongkornUniversityTranscript',
      claims: {},
      expiresAt: '2030-06-15T00:00:00.000Z',
    }

    expect(shouldBlockCredentialDetailPresentment({ kind: 'active' }, credential)).toBe(false)
  })
})
