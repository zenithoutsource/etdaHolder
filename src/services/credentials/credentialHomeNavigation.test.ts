import { shouldNavigateInactiveCredentialToDetail } from './credentialHomeNavigation'
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
  test('navigates renewal-processing and document-expired credentials to detail', () => {
    expect(
      shouldNavigateInactiveCredentialToDetail(inactiveState('renewal-processing')),
    ).toBe(true)
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
})
