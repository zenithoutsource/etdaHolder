import { deleteStoredCredentialAfterHolderApproval } from './credentialDeletion'
import { readCredentialLifecycleStatus } from './credentialLifecycle'
import { readStoredCredentials } from './storedCredentials'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('../history/walletEventLog', () => ({
  appendWalletHistoryEvent: jest.fn(),
}))

jest.mock('../notifications/documentExpiryNotificationService', () => ({
  cancelDocumentExpiryNotifications: jest.fn(),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'BangkokUniversityTranscript',
  rawVc: 'header.payload.signature',
  claims: {},
  issuedAt: '2026-06-08T00:00:00.000Z',
}

function mockStorage(records: VerifiableCredentialRecord[]) {
  const values = new Map<string, string>()
  values.set('credential:index', JSON.stringify(records.map((record) => record.id)))
  for (const record of records) {
    values.set(`credential:${record.id}`, JSON.stringify(record))
  }

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
  return storage
}

describe('deleteStoredCredentialAfterHolderApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('records holder deletion and removes the credential from local storage', () => {
    const storage = mockStorage([transcriptRecord])

    deleteStoredCredentialAfterHolderApproval(transcriptRecord.id)

    expect(readCredentialLifecycleStatus(transcriptRecord.id)?.status).toBe('deleted')
    expect(readStoredCredentials()).toEqual([])
    expect(storage.set).toHaveBeenCalledWith('credential:index', JSON.stringify([]))
    expect(storage.remove).toHaveBeenCalledWith(`credential:${transcriptRecord.id}`)
  })
})
