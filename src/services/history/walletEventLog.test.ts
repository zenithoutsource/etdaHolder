import { createMMKV } from 'react-native-mmkv'

import {
  appendWalletHistoryEvent,
  clearSuccessfulPresentationBadge,
  ensureWalletHistoryBackfill,
  readSuccessfullyPresentedCredentialIds,
  readWalletHistoryEvent,
  readWalletHistoryEvents,
} from './walletEventLog'
import { getCredentialStorage } from '../storage/storage'

jest.mock('../storage/storage', () => {
  const { createMMKV: createTestMmkv } = jest.requireActual('react-native-mmkv')
  const storage = createTestMmkv({ id: 'wallet-event-log-test' })
  return { getCredentialStorage: () => storage }
})

beforeEach(() => {
  getCredentialStorage().clearAll()
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('appendWalletHistoryEvent stores and reads newest first', () => {
  appendWalletHistoryEvent({
    kind: 'presentation-success',
    credentialId: 'cred-1',
    documentType: 'บัตรประชาชน',
    partyName: 'ร้านอาหาร',
    disclosedClaims: ['อายุ'],
    channel: 'oid4vp',
  })

  const events = readWalletHistoryEvents()
  expect(events).toHaveLength(1)
  expect(events[0].kind).toBe('presentation-success')
  expect(events[0].status).toBe('completed')
  expect(readWalletHistoryEvent(events[0].id)).toEqual(events[0])
})

test('appendWalletHistoryEvent returns undefined without throwing when storage fails', () => {
  const storage = getCredentialStorage()
  jest.spyOn(storage, 'set').mockImplementation(() => {
    throw new Error('StorageWriteFailed')
  })

  expect(
    appendWalletHistoryEvent({
      kind: 'presentation-declined',
      credentialId: 'cred-1',
      documentType: 'บัตรประชาชน',
      partyName: 'ร้านอาหาร',
      disclosedClaims: [],
      channel: 'oid4vp',
    }),
  ).toBeUndefined()
})

test('ensureWalletHistoryBackfill migrates two presentation events with same credentialId', () => {
  const storage = getCredentialStorage()
  const id1 = 'cred-1:2026-01-01T00:00:00.000Z:abc123'
  const id2 = 'cred-1:2026-01-02T00:00:00.000Z:def456'
  storage.set('presentation:history:index', JSON.stringify([id1, id2]))
  storage.set(
    `presentation:history:${id1}`,
    JSON.stringify({
      id: id1,
      credentialId: 'cred-1',
      verifierName: 'Seven',
      documentType: 'บัตรประชาชน',
      disclosedClaims: ['อายุ'],
      occurredAt: '2026-01-01T00:00:00.000Z',
    }),
  )
  storage.set(
    `presentation:history:${id2}`,
    JSON.stringify({
      id: id2,
      credentialId: 'cred-1',
      verifierName: 'Hospital',
      documentType: 'บัตรประชาชน',
      disclosedClaims: ['ชื่อ'],
      occurredAt: '2026-01-02T00:00:00.000Z',
    }),
  )

  ensureWalletHistoryBackfill()

  const events = readWalletHistoryEvents().filter((event) => event.kind === 'presentation-success')
  expect(events).toHaveLength(2)
  expect(events.map((event) => event.id).sort()).toEqual([id1, id2].sort())
  expect(storage.getString('wallet:history:backfill:v1')).toBe('done')
})

test('readSuccessfullyPresentedCredentialIds respects badge-cleared timestamp', () => {
  appendWalletHistoryEvent({
    kind: 'presentation-success',
    credentialId: 'cred-1',
    documentType: 'บัตรประชาชน',
    partyName: 'Verifier',
    disclosedClaims: [],
    channel: 'oid4vp',
    occurredAt: '2026-06-01T00:00:00.000Z',
  })
  clearSuccessfulPresentationBadge('cred-1', new Date('2026-06-02T00:00:00.000Z'))
  expect(readSuccessfullyPresentedCredentialIds()).toEqual([])
})
