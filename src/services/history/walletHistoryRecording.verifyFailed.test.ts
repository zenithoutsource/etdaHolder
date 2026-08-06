import { createMMKV } from 'react-native-mmkv'

import { getCredentialStorage } from '../storage/storage'
import { classifyCredentialVerifyFailure, readWalletHistoryEvents } from './walletEventLog'
import { recordCredentialVerifyFailed } from './walletHistoryRecording'
import { matchesWalletHistoryFilter } from './walletHistoryFilters'
import { projectWalletHistoryRow } from './walletHistory'
import type { ResolvedCredentialOffer } from '../vci/exchangeService'

jest.mock('../storage/storage', () => {
  const { createMMKV: createTestMmkv } = jest.requireActual('react-native-mmkv')
  const storage = createTestMmkv({ id: 'wallet-history-verify-failed-test' })
  return { getCredentialStorage: () => storage }
})

beforeEach(() => {
  getCredentialStorage().clearAll()
})

const offer = {
  issuer: 'https://issuer.example.com',
  credentialConfigurations: [{ id: 'ThaiNationalID', format: 'dc+sd-jwt' }],
} as ResolvedCredentialOffer

describe('credential-verify-failed history (P3 step 31)', () => {
  test('classifyCredentialVerifyFailure maps signature errors', () => {
    expect(
      classifyCredentialVerifyFailure(
        new Error('CredentialIssuerSignatureInvalid: issuer JWT signature does not match'),
      ),
    ).toBe('signature-invalid')
    expect(
      classifyCredentialVerifyFailure(new Error('PresentationCredentialHolderBindingMismatch')),
    ).toBe('holder-binding-mismatch')
  })

  test('recordCredentialVerifyFailed appends failed issuance history event', () => {
    recordCredentialVerifyFailed({
      resolvedOffer: offer,
      error: new Error('CredentialIssuerSignatureInvalid'),
    })

    const events = readWalletHistoryEvents()
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('credential-verify-failed')
    expect(events[0]?.status).toBe('failed')
    expect(events[0]?.reasonCode).toBe('signature-invalid')
    expect(events[0]?.channel).toBe('oid4vci')
    expect(matchesWalletHistoryFilter(events[0]!, 'issuance')).toBe(true)

    const row = projectWalletHistoryRow(events[0]!)
    expect(row.actionLabel).toBe('ตรวจสอบเอกสารไม่สำเร็จ')
    expect(row.subtitle).toContain('ลายเซ็นไม่ถูกต้อง')
  })
})
