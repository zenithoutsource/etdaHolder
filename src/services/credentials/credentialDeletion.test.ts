import {
  deleteStoredCredentialAfterHolderApproval,
  purgeCredentialFromWallet,
} from './credentialDeletion'
import { readCredentialLifecycleStatus } from './credentialLifecycle'
import { readStoredCredentials } from './storedCredentials'
import { getCredentialStorage } from '../storage/storage'
import { destroyIssuanceCredentialKey } from '../crypto/perCredentialSigning'
import { deleteStoredMdoc } from '../proximity/mdocStorage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
  getMetaStorage: jest.fn(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  })),
}))

jest.mock('../history/walletEventLog', () => ({
  appendWalletHistoryEvent: jest.fn(),
}))

jest.mock('../history/presentationHistory', () => ({
  clearSuccessfulPresentationBadge: jest.fn(),
}))

jest.mock('../notifications/documentExpiryNotificationService', () => ({
  cancelDocumentExpiryNotifications: jest.fn(async () => undefined),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../crypto/perCredentialSigning', () => ({
  destroyIssuanceCredentialKey: jest.fn(async () => undefined),
}))

jest.mock('../proximity/mdocStorage', () => ({
  deleteStoredMdoc: jest.fn(async () => undefined),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock
const destroyIssuanceCredentialKeyMock = destroyIssuanceCredentialKey as jest.MockedFunction<
  typeof destroyIssuanceCredentialKey
>
const deleteStoredMdocMock = deleteStoredMdoc as jest.MockedFunction<typeof deleteStoredMdoc>

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'ChulalongkornUniversityTranscript',
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
  return { storage, values }
}

describe('deleteStoredCredentialAfterHolderApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('purges the credential from local storage without leaving a lifecycle marker', () => {
    const { storage, values } = mockStorage([transcriptRecord])
    values.set(
      `credential:lifecycle:${transcriptRecord.id}`,
      JSON.stringify({
        credentialId: transcriptRecord.id,
        action: 'Delete',
        status: 'deleted',
        occurredAt: '2026-06-08T00:00:00.000Z',
      }),
    )

    deleteStoredCredentialAfterHolderApproval(transcriptRecord.id)

    expect(readStoredCredentials()).toEqual([])
    expect(readCredentialLifecycleStatus(transcriptRecord.id)).toBeUndefined()
    expect(storage.set).toHaveBeenCalledWith('credential:index', JSON.stringify([]))
    expect(storage.remove).toHaveBeenCalledWith(`credential:${transcriptRecord.id}`)
    expect(storage.remove).toHaveBeenCalledWith(`credential:lifecycle:${transcriptRecord.id}`)
    expect(destroyIssuanceCredentialKeyMock).toHaveBeenCalledWith(transcriptRecord.id)
    expect(deleteStoredMdocMock).toHaveBeenCalledWith(transcriptRecord.id)
  })
})

describe('purgeCredentialFromWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('records system-initiated deletion and purges storage', () => {
    mockStorage([transcriptRecord])

    purgeCredentialFromWallet(transcriptRecord.id, 'system')

    expect(readStoredCredentials()).toEqual([])
    expect(readCredentialLifecycleStatus(transcriptRecord.id)).toBeUndefined()
  })
})
