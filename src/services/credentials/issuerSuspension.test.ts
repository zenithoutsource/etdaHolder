import {
  acknowledgeIssuerSuspension,
  hasPendingIssuerSuspensionAck,
  readIssuerSuspension,
  readIssuerSuspensionStatuses,
  refreshIssuerSuspensionsFromServer,
  writeIssuerSuspension,
} from './issuerSuspension'
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
  type: 'ChulalongkornUniversityTranscript',
  rawVc: 'header.payload.signature',
  claims: {},
  issuedAt: '2026-06-25T00:00:00.000Z',
}

describe('issuerSuspension', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('writes and reads issuer suspension records', () => {
    const storage = mockStorage()

    writeIssuerSuspension({
      credentialId: 'transcript-1',
      suspendedAt: '2026-06-25T10:00:00.000Z',
      reasonCode: 'issuer-review',
      issuerRef: 'issuer-1',
      updatedAt: '2026-06-25T10:00:00.000Z',
    })

    expect(storage.set).toHaveBeenCalledWith(
      'credential:suspension:transcript-1',
      JSON.stringify({
        credentialId: 'transcript-1',
        suspendedAt: '2026-06-25T10:00:00.000Z',
        reasonCode: 'issuer-review',
        issuerRef: 'issuer-1',
        updatedAt: '2026-06-25T10:00:00.000Z',
      }),
    )
    expect(readIssuerSuspension('transcript-1')).toEqual({
      credentialId: 'transcript-1',
      suspendedAt: '2026-06-25T10:00:00.000Z',
      reasonCode: 'issuer-review',
      issuerRef: 'issuer-1',
      updatedAt: '2026-06-25T10:00:00.000Z',
    })
  })

  test('records issuer suspension acknowledgment timestamp', () => {
    mockStorage({
      'credential:suspension:transcript-1': JSON.stringify({
        credentialId: 'transcript-1',
        suspendedAt: '2026-06-25T10:00:00.000Z',
        updatedAt: '2026-06-25T10:00:00.000Z',
      }),
    })

    const acknowledged = acknowledgeIssuerSuspension(
      'transcript-1',
      new Date('2026-06-25T11:00:00.000Z'),
    )

    expect(acknowledged).toEqual({
      credentialId: 'transcript-1',
      suspendedAt: '2026-06-25T10:00:00.000Z',
      acknowledgedAt: '2026-06-25T11:00:00.000Z',
      updatedAt: '2026-06-25T11:00:00.000Z',
    })
    expect(hasPendingIssuerSuspensionAck(acknowledged)).toBe(false)
  })

  test('reads visible issuer suspension statuses and clears stale records after reissue', () => {
    const storage = mockStorage({
      'credential:suspension:transcript-1': JSON.stringify({
        credentialId: 'transcript-1',
        suspendedAt: '2026-06-25T10:00:00.000Z',
        updatedAt: '2026-06-25T10:00:00.000Z',
      }),
    })

    expect(
      readIssuerSuspensionStatuses([
        {
          ...transcriptRecord,
          issuedAt: '2026-06-25T12:00:00.000Z',
        },
      ]),
    ).toEqual({})
    expect(storage.remove).toHaveBeenCalledWith('credential:suspension:transcript-1')
  })

  test('refreshes issuer suspension records from the dev server endpoint', async () => {
    mockStorage()
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suspensions: [
          {
            credentialId: 'transcript-1',
            suspendedAt: '2026-06-25T10:00:00.000Z',
            reasonCode: 'issuer-review',
            updatedAt: '2026-06-25T10:30:00.000Z',
          },
        ],
      }),
    })

    await refreshIssuerSuspensionsFromServer(fetchMock as typeof fetch)

    expect(fetchMock).toHaveBeenCalledWith('/wallet-api/dev/wallet/suspension-status')
    expect(readIssuerSuspension('transcript-1')).toEqual({
      credentialId: 'transcript-1',
      suspendedAt: '2026-06-25T10:00:00.000Z',
      reasonCode: 'issuer-review',
      updatedAt: '2026-06-25T10:30:00.000Z',
    })
  })
})
