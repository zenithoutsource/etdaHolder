import { readStoredCredentials } from './storedCredentials'
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
  type: 'BangkokUniversityTranscript',
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
