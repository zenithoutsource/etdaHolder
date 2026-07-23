import {
  readStoredCredentials,
  removeStoredCredential,
  subscribeCredentialsChange,
} from './storedCredentials'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

function mockStorage(records: VerifiableCredentialRecord[]) {
  const values = new Map<string, string>()
  values.set('credential:index', JSON.stringify(records.map((record) => record.id)))
  for (const record of records) {
    values.set(`credential:${record.id}`, JSON.stringify(record))
  }

  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return storage
}

const firstRecord: VerifiableCredentialRecord = {
  id: 'transcript-old',
  type: 'ChulalongkornUniversityTranscript',
  rawVc: 'old.header.payload.signature',
  claims: {},
  issuedAt: '2026-06-15T09:00:00.000Z',
}

const reissuedRecord: VerifiableCredentialRecord = {
  ...firstRecord,
  id: 'transcript-new',
  rawVc: 'new.header.payload.signature',
  issuedAt: '2026-06-15T10:00:00.000Z',
}

describe('readStoredCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('reads the current credential records from storage on each call', () => {
    mockStorage([firstRecord])
    expect(readStoredCredentials()).toEqual([firstRecord])

    mockStorage([reissuedRecord])
    expect(readStoredCredentials()).toEqual([reissuedRecord])
  })
})

describe('removeStoredCredential', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('notifies credential change listeners after removal', () => {
    const values = new Map<string, string>()
    values.set('credential:index', JSON.stringify(['transcript-old']))
    values.set(`credential:${firstRecord.id}`, JSON.stringify(firstRecord))

    const storage = {
      getString: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: string) => {
        values.set(key, value)
      }),
      remove: jest.fn((key: string) => values.delete(key)),
    }
    getCredentialStorageMock.mockReturnValue(storage)

    const listener = jest.fn()
    const unsubscribe = subscribeCredentialsChange(listener)

    removeStoredCredential(firstRecord.id)

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
