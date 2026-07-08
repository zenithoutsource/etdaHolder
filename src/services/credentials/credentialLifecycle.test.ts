import {
  filterPresentableCredentials,
  readCredentialLifecycleStatus,
  readCredentialLifecycleStatuses,
  recordCredentialLifecycleAction,
} from './credentialLifecycle'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import { appendWalletHistoryEvent } from '../history/walletEventLog'
import { getCredentialStorage } from '../storage/storage'
import { readStoredCredentialById } from './storedCredentials'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('./storedCredentials', () => ({
  readStoredCredentialById: jest.fn(),
}))

jest.mock('../history/walletEventLog', () => ({
  appendWalletHistoryEvent: jest.fn(),
}))

const readStoredCredentialByIdMock = readStoredCredentialById as jest.Mock
const appendWalletHistoryEventMock = appendWalletHistoryEvent as jest.Mock

jest.mock('./credentialDocumentExpiry', () => {
  const actual = jest.requireActual('./credentialDocumentExpiry') as typeof import('./credentialDocumentExpiry')
  return {
    ...actual,
    isCredentialDocumentExpired: jest.fn(actual.isCredentialDocumentExpired),
  }
})

const isCredentialDocumentExpiredMock = isCredentialDocumentExpired as jest.MockedFunction<
  typeof isCredentialDocumentExpired
>

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
    mockStorage()
    readStoredCredentialByIdMock.mockReturnValue(undefined)
    isCredentialDocumentExpiredMock.mockImplementation(
      jest.requireActual('./credentialDocumentExpiry').isCredentialDocumentExpired,
    )
  })

  test('records a revoke action without removing the credential record', () => {
    const storage = mockStorage()

    const status = recordCredentialLifecycleAction(
      'transcript-1',
      'Revoke',
      'holder',
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

  test('recordCredentialLifecycleAction appends revoked history event', () => {
    mockStorage()
    readStoredCredentialByIdMock.mockReturnValue(transcriptRecord)

    recordCredentialLifecycleAction(
      'transcript-1',
      'Revoke',
      'holder',
      new Date('2026-06-08T10:00:00.000Z'),
    )

    expect(appendWalletHistoryEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'credential-revoked',
        credentialId: 'transcript-1',
        channel: 'wallet',
        initiatedBy: 'holder',
        occurredAt: '2026-06-08T10:00:00.000Z',
      }),
    )
  })

  test('recordCredentialLifecycleAction Used marks credential and blocks presentation', () => {
    mockStorage()
    readStoredCredentialByIdMock.mockReturnValue(transcriptRecord)

    recordCredentialLifecycleAction('transcript-1', 'Used', 'system')

    expect(readCredentialLifecycleStatus('transcript-1')?.status).toBe('used')
    expect(filterPresentableCredentials([transcriptRecord])).toEqual([])
    expect(appendWalletHistoryEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'credential-used', initiatedBy: 'system' }),
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

  test('excludes issuer-suspended credentials from presentation candidates', () => {
    mockStorage({
      'credential:suspension:transcript-1': JSON.stringify({
        credentialId: 'transcript-1',
        suspendedAt: '2026-06-25T10:00:00.000Z',
        updatedAt: '2026-06-25T10:00:00.000Z',
      }),
    })

    const freshTranscriptRecord: VerifiableCredentialRecord = {
      ...transcriptRecord,
      id: 'fresh-transcript',
    }

    expect(filterPresentableCredentials([transcriptRecord, freshTranscriptRecord])).toEqual([
      freshTranscriptRecord,
    ])
  })

  test('excludes document-expired credentials from presentation candidates', () => {
    const expiredTranscript: VerifiableCredentialRecord = {
      ...transcriptRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    }
    const freshTranscriptRecord: VerifiableCredentialRecord = {
      ...transcriptRecord,
      id: 'fresh-transcript',
      expiresAt: '2035-01-01T00:00:00.000Z',
    }

    expect(
      filterPresentableCredentials([expiredTranscript, freshTranscriptRecord]),
    ).toEqual([freshTranscriptRecord])
  })

  test('keeps expiring-soon credentials presentable until expiry day ends', () => {
    const expiringSoonTranscript: VerifiableCredentialRecord = {
      ...transcriptRecord,
      expiresAt: '2030-06-15T00:00:00.000Z',
    }
    isCredentialDocumentExpiredMock.mockReturnValue(false)

    expect(filterPresentableCredentials([expiringSoonTranscript])).toEqual([
      expiringSoonTranscript,
    ])
  })

  test('excludes credentials when document expiry helper reports expired', () => {
    const expiringSoonTranscript: VerifiableCredentialRecord = {
      ...transcriptRecord,
      expiresAt: '2030-06-15T00:00:00.000Z',
    }
    isCredentialDocumentExpiredMock.mockReturnValue(true)

    expect(filterPresentableCredentials([expiringSoonTranscript])).toEqual([])
  })
})
