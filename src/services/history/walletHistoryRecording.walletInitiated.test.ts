import { createMMKV } from 'react-native-mmkv'

import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { getCredentialStorage } from '../storage/storage'
import { readWalletHistoryEvents } from './walletEventLog'
import {
  mapVerifierReasonToHistory,
  recordWalletInitiatedPresentationFailure,
} from './walletHistoryRecording'

jest.mock('../storage/storage', () => {
  const { createMMKV: createTestMmkv } = jest.requireActual('react-native-mmkv')
  const storage = createTestMmkv({ id: 'wallet-history-wallet-initiated-test' })
  return { getCredentialStorage: () => storage }
})

beforeEach(() => {
  getCredentialStorage().clearAll()
})

const record = {
  id: 'cred-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~',
  claims: { givenName: 'Ada' },
  issuedAt: '2026-01-01T00:00:00.000Z',
} as VerifiableCredentialRecord

describe('wallet-initiated presentation failure history', () => {
  test('mapVerifierReasonToHistory maps issuer signature', () => {
    expect(mapVerifierReasonToHistory('issuer-signature-invalid')).toBe('signature-invalid')
  })

  test('mapVerifierReasonToHistory maps kb binding issues', () => {
    expect(mapVerifierReasonToHistory('cnf-missing')).toBe('holder-binding-mismatch')
  })

  test('recordWalletInitiatedPresentationFailure appends presentation-failed', () => {
    recordWalletInitiatedPresentationFailure({
      record,
      verifierReason: 'kb-nonce-mismatch',
      disclosedClaims: ['ชื่อ'],
    })

    const events = readWalletHistoryEvents()
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('presentation-failed')
    expect(events[0]?.channel).toBe('wallet')
    expect(events[0]?.partyName).toBe('Verifier')
    expect(events[0]?.reasonCode).toBe('verifier-rejected')
  })
})
