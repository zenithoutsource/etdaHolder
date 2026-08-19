jest.mock('../storage/storage', () => {
  const { createMMKV: createTestMmkv } = jest.requireActual('react-native-mmkv')
  const credentialStorage = createTestMmkv({ id: 'presentation-history-credential-test' })
  const metaStorage = createTestMmkv({ id: 'presentation-history-meta-test' })
  return {
    getCredentialStorage: jest.fn(() => credentialStorage),
    getMetaStorage: jest.fn(() => metaStorage),
  }
})

jest.mock('../credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
  notifyCredentialsChanged: jest.fn(),
}))

jest.mock('../credentials/credentialLifecycle', () =>
  jest.requireActual('../credentials/credentialLifecycle'),
)

import {
  clearSuccessfulPresentationBadge,
  readSuccessfullyPresentedCredentialIds,
  readSuccessfulPresentationHistory,
  recordSuccessfulPresentation,
} from './presentationHistory'
import { readCredentialLifecycleStatus } from '../credentials/credentialLifecycle'
import { getCredentialStorage } from '../storage/storage'
import type { WalletHistoryEvent } from './walletEventLog'

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

function walletPresentationEvent(overrides: Partial<WalletHistoryEvent> = {}): WalletHistoryEvent {
  return {
    id: 'first',
    kind: 'presentation-success',
    status: 'completed',
    credentialId: 'thai-id-1',
    documentType: 'Thai National ID',
    partyName: 'Entertainment Venue',
    disclosedClaims: ['Date of Birth'],
    channel: 'oid4vp',
    occurredAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  }
}

describe('presentationHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('records successful presentation events in wallet history storage', () => {
    const storage = mockStorage()

    const event = recordSuccessfulPresentation({
      credentialId: 'thai-id-1',
      credentialType: 'ThaiNationalID',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      now: new Date('2026-06-09T10:00:00.000Z'),
    })

    expect(event).toBeDefined()
    if (!event) {
      throw new Error('expected presentation event')
    }
    expect(event).toMatchObject({
      credentialId: 'thai-id-1',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      occurredAt: '2026-06-09T10:00:00.000Z',
    })
    expect(storage.set).toHaveBeenCalledWith(
      `wallet:history:event:${event.id}`,
      expect.stringContaining('"kind":"presentation-success"'),
    )
    expect(storage.set).toHaveBeenCalledWith('wallet:history:index', JSON.stringify([event.id]))
  })

  test('persists deliveryPath on successful oid4vp presentation history', () => {
    const storage = mockStorage()

    recordSuccessfulPresentation({
      credentialId: 'thai-id-1',
      credentialType: 'ThaiNationalID',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      deliveryPath: 'deep-link',
      now: new Date('2026-06-09T10:00:00.000Z'),
    })

    expect(storage.set).toHaveBeenCalledWith(
      expect.stringMatching(/^wallet:history:event:/),
      expect.stringContaining('"deliveryPath":"deep-link"'),
    )
  })

  test('reads presentation events newest first and skips malformed rows', () => {
    const first = walletPresentationEvent()
    const second = walletPresentationEvent({
      id: 'second',
      partyName: 'Age Gate',
      occurredAt: '2026-06-10T10:00:00.000Z',
    })
    mockStorage({
      'wallet:history:index': JSON.stringify(['broken', 'first', 'second']),
      'wallet:history:event:broken': JSON.stringify({ id: 'broken' }),
      'wallet:history:event:first': JSON.stringify(first),
      'wallet:history:event:second': JSON.stringify(second),
    })

    expect(readSuccessfulPresentationHistory()).toEqual([
      {
        id: 'second',
        credentialId: 'thai-id-1',
        verifierName: 'Age Gate',
        documentType: 'Thai National ID',
        disclosedClaims: ['Date of Birth'],
        occurredAt: '2026-06-10T10:00:00.000Z',
      },
      {
        id: 'first',
        credentialId: 'thai-id-1',
        verifierName: 'Entertainment Venue',
        documentType: 'Thai National ID',
        disclosedClaims: ['Date of Birth'],
        occurredAt: '2026-06-09T10:00:00.000Z',
      },
    ])
  })

  test('reads unique credential ids with successful presentations', () => {
    const first = walletPresentationEvent()
    const second = walletPresentationEvent({
      id: 'second',
      partyName: 'Age Gate',
      occurredAt: '2026-06-10T10:00:00.000Z',
    })
    const third = walletPresentationEvent({
      id: 'third',
      credentialId: 'transcript-1',
      documentType: 'Academic Transcript',
      occurredAt: '2026-06-11T10:00:00.000Z',
    })
    mockStorage({
      'wallet:history:index': JSON.stringify(['broken', 'first', 'second', 'third']),
      'wallet:history:event:broken': JSON.stringify({ id: 'broken' }),
      'wallet:history:event:first': JSON.stringify(first),
      'wallet:history:event:second': JSON.stringify(second),
      'wallet:history:event:third': JSON.stringify(third),
    })

    expect(readSuccessfullyPresentedCredentialIds()).toEqual(['transcript-1', 'thai-id-1'])
  })

  test('includes nfc-presentation-success in the home verified badge ids', () => {
    const nfc = walletPresentationEvent({
      id: 'nfc-1',
      kind: 'nfc-presentation-success',
      credentialId: 'dl-1',
      documentType: 'Driving Licence',
      partyName: 'เครื่องอ่าน NFC',
      channel: 'nfc',
    })
    mockStorage({
      'wallet:history:index': JSON.stringify(['nfc-1']),
      'wallet:history:event:nfc-1': JSON.stringify(nfc),
    })

    expect(readSuccessfullyPresentedCredentialIds()).toEqual(['dl-1'])
  })

  test('clears the current successful presentation badge but shows it again after a later presentation', () => {
    const first = walletPresentationEvent()
    const storage = mockStorage({
      'wallet:history:index': JSON.stringify(['first']),
      'wallet:history:event:first': JSON.stringify(first),
    })

    clearSuccessfulPresentationBadge('thai-id-1', new Date('2026-06-09T10:01:00.000Z'))

    expect(readSuccessfullyPresentedCredentialIds()).toEqual([])
    expect(storage.set).toHaveBeenCalledWith(
      'presentation:badge-cleared:thai-id-1',
      '2026-06-09T10:01:00.000Z',
    )

    const second = walletPresentationEvent({
      id: 'second',
      occurredAt: '2026-06-09T10:02:00.000Z',
    })
    storage.set('wallet:history:index', JSON.stringify(['first', 'second']))
    storage.set('wallet:history:event:second', JSON.stringify(second))

    expect(readSuccessfullyPresentedCredentialIds()).toEqual(['thai-id-1'])
  })

  test('marks MedicalCertificate used after successful OID4VP presentation', () => {
    mockStorage()

    recordSuccessfulPresentation({
      credentialId: 'med-1',
      credentialType: 'MedicalCertificate',
      verifierName: 'Pharmacy',
      documentType: 'Medical Certificate',
      disclosedClaims: ['Patient Name'],
    })

    expect(readCredentialLifecycleStatus('med-1')?.status).toBe('used')
  })

  test('does not mark Transcript used after successful OID4VP presentation', () => {
    mockStorage()

    recordSuccessfulPresentation({
      credentialId: 'transcript-1',
      credentialType: 'ChulalongkornUniversityTranscript',
      verifierName: 'University',
      documentType: 'Academic Transcript',
      disclosedClaims: ['GPA'],
    })

    expect(readCredentialLifecycleStatus('transcript-1')).toBeUndefined()
  })
})
