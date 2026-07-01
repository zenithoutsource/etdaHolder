import {
  confirmOldCredentialCleanup,
  refreshAndCompleteRenewals,
  repairInconsistentRenewalPairs,
  submitRenewalRequest,
} from './credentialRenewalService'
import { findCleanupPendingForCredentialType } from './renewalCleanupNotification'
import { readCredentialRenewal, writeCredentialRenewal } from './credentialKeyRenewal'
import { readStoredCredentials } from './storedCredentials'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('./credentialHolderBinding', () => ({
  readCredentialHolderDid: () => 'did:key:old',
}))

jest.mock('../crypto/crypto', () => ({
  getHolderDid: () => 'did:key:new',
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../crypto/walletKeyRotation', () => ({
  clearWalletKeyRotationRecord: jest.fn(),
}))

jest.mock('../notifications/pushNotificationService', () => ({
  syncPushTokenRegistration: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

const mockCredential: VerifiableCredentialRecord = {
  id: 'urn:uuid:old',
  type: 'ThaiNationalID',
  rawVc: 'eyJ.test',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

function mockStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
      return true
    }),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { storage, values }
}

function seedCredential(values: Map<string, string>, credential: VerifiableCredentialRecord) {
  values.set('credential:index', JSON.stringify([credential.id]))
  values.set(`credential:${credential.id}`, JSON.stringify(credential))
}

describe('submitRenewalRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('sets renewal-processing on HTTP 201 and does not claim', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const claimMock = jest.fn()
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ accepted: true }),
    })

    await submitRenewalRequest(mockCredential.id, {
      fetchImpl: fetchMock,
      claimCredential: claimMock,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(claimMock).not.toHaveBeenCalled()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
  })

  test('re-registers the current push token for the rotated holder DID before requesting renewal', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ accepted: true }),
    })
    const syncPushTokenRegistration = jest.fn().mockResolvedValue(undefined)

    await submitRenewalRequest(mockCredential.id, {
      fetchImpl: fetchMock,
      syncPushTokenRegistration,
    })

    expect(syncPushTokenRegistration).toHaveBeenCalledWith('did:key:new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('stays renewal-required on HTTP failure', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 502 })

    await expect(
      submitRenewalRequest(mockCredential.id, { fetchImpl: fetchMock }),
    ).rejects.toThrow('CredentialRenewalRequestFailed')

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
  })

  test('throws when already submitted', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await expect(submitRenewalRequest(mockCredential.id)).rejects.toThrow(
      'CredentialRenewalAlreadySubmitted',
    )
  })
})

describe('refreshAndCompleteRenewals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('auto-claims when offer-ready and sets renewed-active + cleanup-pending', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    const replacement: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        renewals: [
          {
            credentialId: mockCredential.id,
            state: 'offer-ready',
            offerUri: 'openid-credential-offer://test',
          },
        ],
      }),
    })

    const resolveOfferMock = jest.fn().mockResolvedValue({ offer: 'resolved' })
    const claimMock = jest.fn().mockResolvedValue(replacement)

    await refreshAndCompleteRenewals({
      fetchImpl: fetchMock,
      resolveOffer: resolveOfferMock,
      claimCredential: claimMock,
    })

    expect(resolveOfferMock).toHaveBeenCalledWith('openid-credential-offer://test')
    expect(claimMock).toHaveBeenCalled()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('cleanup-pending')
    expect(readCredentialRenewal(mockCredential.id)?.replacementCredentialId).toBe(replacement.id)
    expect(readCredentialRenewal(replacement.id)?.state).toBe('renewed-active')
  })

  test('renewed-active record for replacement has no self-referential replacementCredentialId', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    const replacement: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }

    await refreshAndCompleteRenewals({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [{ credentialId: mockCredential.id, state: 'offer-ready', offerUri: 'openid-credential-offer://test' }],
        }),
      }),
      resolveOffer: jest.fn().mockResolvedValue({ offer: 'resolved' }),
      claimCredential: jest.fn().mockResolvedValue(replacement),
    })

    const replacementRecord = readCredentialRenewal(replacement.id)
    expect(replacementRecord?.state).toBe('renewed-active')
    expect(replacementRecord?.replacementCredentialId).toBeUndefined()
  })

  test('transitions cleanup-pending to old-revoked when server confirms revocation', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      replacementCredentialId: 'urn:uuid:new',
      renewedAt: '2026-06-26T00:00:00.000Z',
      state: 'cleanup-pending',
      updatedAt: new Date().toISOString(),
    })

    await refreshAndCompleteRenewals({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [{ credentialId: mockCredential.id, state: 'revoked', revokedAt: '2026-06-26T12:00:00.000Z' }],
        }),
      }),
    })

    const record = readCredentialRenewal(mockCredential.id)
    expect(record?.state).toBe('old-revoked')
    expect(record?.revokedAt).toBe('2026-06-26T12:00:00.000Z')
  })
})

describe('repairInconsistentRenewalPairs', () => {
  test('moves stale old credential to cleanup-pending when renewed-active sibling exists', () => {
    const { values } = mockStorage()
    const oldCredential: VerifiableCredentialRecord = {
      id: 'urn:uuid:old',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.old',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    const newCredential: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }

    seedCredential(values, oldCredential)
    values.set('credential:index', JSON.stringify([oldCredential.id, newCredential.id]))
    values.set(`credential:${newCredential.id}`, JSON.stringify(newCredential))
    writeCredentialRenewal({
      credentialId: oldCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    writeCredentialRenewal({
      credentialId: newCredential.id,
      previousHolderDid: 'did:key:old',
      replacementCredentialId: newCredential.id,
      state: 'renewed-active',
      renewedAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })

    repairInconsistentRenewalPairs()

    expect(readCredentialRenewal(oldCredential.id)?.state).toBe('cleanup-pending')
    expect(readCredentialRenewal(oldCredential.id)?.replacementCredentialId).toBe(newCredential.id)
  })
})

describe('confirmOldCredentialCleanup', () => {
  test('removes old credential and clears renewed-active metadata on replacement', () => {
    const { values } = mockStorage()
    const oldCredential: VerifiableCredentialRecord = {
      id: 'urn:uuid:old',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.old',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    const newCredential: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }

    values.set('credential:index', JSON.stringify([oldCredential.id, newCredential.id]))
    values.set(`credential:${oldCredential.id}`, JSON.stringify(oldCredential))
    values.set(`credential:${newCredential.id}`, JSON.stringify(newCredential))
    writeCredentialRenewal({
      credentialId: oldCredential.id,
      previousHolderDid: 'did:key:old',
      replacementCredentialId: newCredential.id,
      state: 'cleanup-pending',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    writeCredentialRenewal({
      credentialId: newCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewed-active',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })

    confirmOldCredentialCleanup(oldCredential.id)

    expect(readStoredCredentials().map((record) => record.id)).toEqual([newCredential.id])
    expect(readCredentialRenewal(oldCredential.id)).toBeUndefined()
    expect(readCredentialRenewal(newCredential.id)).toBeUndefined()
    expect(findCleanupPendingForCredentialType('ThaiNationalID')).toBeUndefined()
  })
})
