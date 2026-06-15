import {
  filterPresentableCredentials,
  readCredentialLifecycleStatus,
  readCredentialLifecycleStatuses,
  recordCredentialLifecycleAction,
} from './credentialLifecycle'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

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
  return storage
}

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'BangkokUniversityTranscript',
  rawVc: 'header.payload.signature',
  claims: {},
  issuedAt: '2026-06-08T00:00:00.000Z',
}

describe('credentialLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('records a revoke action without removing the credential record', () => {
    const storage = mockStorage()

    const status = recordCredentialLifecycleAction(
      'transcript-1',
      'Revoke',
      new Date('2026-06-08T10:00:00.000Z'),
    )

    expect(status).toEqual({
      credentialId: 'transcript-1',
      action: 'Revoke',
      status: 'revoked',
      occurredAt: '2026-06-08T10:00:00.000Z',
    })
    expect(storage.set).toHaveBeenCalledWith(
      'credential:lifecycle:transcript-1',
      JSON.stringify(status),
    )
  })

  test('reads lifecycle statuses for visible credential rows', () => {
    mockStorage({
      'credential:lifecycle:transcript-1': JSON.stringify({
        credentialId: 'transcript-1',
        action: 'Delete',
        status: 'deleted',
        occurredAt: '2026-06-08T10:00:00.000Z',
      }),
    })

    expect(readCredentialLifecycleStatus('transcript-1')).toMatchObject({
      action: 'Delete',
      status: 'deleted',
    })
    expect(readCredentialLifecycleStatuses([transcriptRecord])).toEqual({
      'transcript-1': expect.objectContaining({ status: 'deleted' }),
    })
  })

  test('ignores stale lifecycle statuses older than the saved credential issuance time', () => {
    const storage = mockStorage({
      'credential:lifecycle:transcript-1': JSON.stringify({
        credentialId: 'transcript-1',
        action: 'Revoke',
        status: 'revoked',
        occurredAt: '2026-06-08T10:00:00.000Z',
      }),
    })

    expect(
      readCredentialLifecycleStatuses([
        {
          ...transcriptRecord,
          issuedAt: '2026-06-08T11:00:00.000Z',
        },
      ]),
    ).toEqual({})
    expect(storage.remove).toHaveBeenCalledWith('credential:lifecycle:transcript-1')
  })

  test('excludes active revoked or deleted credentials from presentation candidates', () => {
    mockStorage({
      'credential:lifecycle:transcript-1': JSON.stringify({
        credentialId: 'transcript-1',
        action: 'Revoke',
        status: 'revoked',
        occurredAt: '2026-06-08T10:00:00.000Z',
      }),
      'credential:lifecycle:thai-id-1': JSON.stringify({
        credentialId: 'thai-id-1',
        action: 'Delete',
        status: 'deleted',
        occurredAt: '2026-06-08T10:00:00.000Z',
      }),
    })

    const thaiIdRecord: VerifiableCredentialRecord = {
      id: 'thai-id-1',
      type: 'ThaiNationalID',
      rawVc: 'header.payload.signature',
      claims: {},
      issuedAt: '2026-06-08T00:00:00.000Z',
    }
    const freshTranscriptRecord: VerifiableCredentialRecord = {
      ...transcriptRecord,
      id: 'fresh-transcript',
    }

    expect(filterPresentableCredentials([transcriptRecord, thaiIdRecord, freshTranscriptRecord])).toEqual([
      freshTranscriptRecord,
    ])
  })
})
