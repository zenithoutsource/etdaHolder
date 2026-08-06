import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  dismissRenewalCleanupBanner,
  findCleanupPendingForCredentialType,
  readDismissedRenewalCleanupBannerIds,
  readRenewalsAwaitingCleanup,
  readVisibleRenewalCleanupBanners,
} from './renewalCleanupNotification'

jest.mock('../storage/storage', () => {
  const store = new Map<string, string>()
  return {
    getCredentialStorage: () => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => {
        store.set(key, value)
      },
      delete: (key: string) => {
        store.delete(key)
      },
    }),
  }
})

const mockCredential: VerifiableCredentialRecord = {
  id: 'old-cred-1',
  type: 'ThaiNationalID',
  issuedAt: '2026-01-01T00:00:00.000Z',
  rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
  claims: {},
}

describe('renewalCleanupNotification', () => {
  test('lists cleanup-pending renewals and hides dismissed banners', () => {
    const renewalStatuses = {
      'old-cred-1': {
        credentialId: 'old-cred-1',
        previousHolderDid: 'did:key:old',
        replacementCredentialId: 'new-cred-1',
        state: 'cleanup-pending' as const,
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    }

    expect(readRenewalsAwaitingCleanup([mockCredential], renewalStatuses)).toEqual([
      {
        oldCredentialId: 'old-cred-1',
        replacementCredentialId: 'new-cred-1',
      },
    ])

    dismissRenewalCleanupBanner('old-cred-1')
    expect(readDismissedRenewalCleanupBannerIds()).toEqual(['old-cred-1'])
    expect(
      readVisibleRenewalCleanupBanners([mockCredential], renewalStatuses),
    ).toEqual([])
  })

  test('finds cleanup-pending credential by document type', () => {
    const renewalStatuses = {
      'old-cred-1': {
        credentialId: 'old-cred-1',
        previousHolderDid: 'did:key:old',
        replacementCredentialId: 'new-cred-1',
        state: 'cleanup-pending' as const,
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    }

    expect(
      findCleanupPendingForCredentialType(
        'ThaiNationalID',
        [mockCredential],
        renewalStatuses,
      ),
    ).toEqual({
      oldCredentialId: 'old-cred-1',
      replacementCredentialId: 'new-cred-1',
    })
  })

  test('treats old-revoked with replacement as awaiting cleanup', () => {
    const renewalStatuses = {
      'old-cred-1': {
        credentialId: 'old-cred-1',
        previousHolderDid: 'did:key:old',
        replacementCredentialId: 'new-cred-1',
        state: 'old-revoked' as const,
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    }

    expect(
      findCleanupPendingForCredentialType(
        'ThaiNationalID',
        [mockCredential],
        renewalStatuses,
      )?.oldCredentialId,
    ).toBe('old-cred-1')
  })
})
