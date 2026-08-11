import { createMMKV } from 'react-native-mmkv'

jest.mock('../credentials/credentialLifecycle', () => ({
  readCredentialLifecycleStatus: jest.fn(),
}))

jest.mock('../credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('../storage/storage', () => {
  const { createMMKV: createTestMmkv } = jest.requireActual('react-native-mmkv')
  const storage = createTestMmkv({ id: 'wallet-history-projection-test' })
  return { getCredentialStorage: () => storage }
})

import { getCredentialStorage } from '../storage/storage'
import { projectWalletHistoryRow } from './walletHistory'

beforeEach(() => {
  getCredentialStorage().clearAll()
})

describe('walletHistory projection', () => {
  test('projectWalletHistoryRow maps system delete subtitle', () => {
    const row = projectWalletHistoryRow({
      id: 'e1',
      kind: 'credential-deleted',
      status: 'deleted',
      occurredAt: '2026-06-01T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'ใบขับขี่',
      partyName: 'กรมขนส่ง',
      disclosedClaims: [],
      channel: 'wallet',
      initiatedBy: 'system',
    })

    expect(row.actionLabel).toBe('ลบเอกสารแล้ว')
    expect(row.subtitle).toContain('หมดอายุ')
    expect(row.infoBoxLabel).toBe('เอกสาร')
  })

  test('projectWalletHistoryRow maps presentation success with claims', () => {
    const row = projectWalletHistoryRow({
      id: 'e2',
      kind: 'presentation-success',
      status: 'completed',
      occurredAt: '2026-06-02T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'บัตรประชาชน',
      partyName: 'ร้านอาหาร',
      disclosedClaims: ['อายุ'],
      channel: 'oid4vp',
    })

    expect(row.actionLabel).toBe('แสดงเอกสารสำเร็จ')
    expect(row.subtitle).toBe('ข้อมูลที่เปิดเผย: อายุ')
    expect(row.channelCaption).toBe('ผ่าน QR Verifier')
    expect(row.infoBoxLabel).toBe('ประเภทข้อมูลที่เข้าถึง')
    expect(row.showSuspendAccessButton).toBe(true)
  })

  test('projectWalletHistoryRow maps relay presentation channel caption', () => {
    const row = projectWalletHistoryRow({
      id: 'e3',
      kind: 'presentation-success',
      status: 'completed',
      occurredAt: '2026-06-03T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'บัตรประชาชน',
      partyName: 'VP Relay (dev)',
      disclosedClaims: ['ชื่อ'],
      channel: 'wallet',
    })

    expect(row.channelCaption).toBe('ผ่าน VP Relay (ทดสอบ)')
    expect(row.partyName).toBe('VP Relay (dev)')
  })

  test('projectWalletHistoryRow maps presentation failure', () => {
    const row = projectWalletHistoryRow({
      id: 'e4',
      kind: 'presentation-failed',
      status: 'failed',
      occurredAt: '2026-06-04T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'บัตรประชาชน',
      partyName: 'ร้านอาหาร',
      disclosedClaims: ['อายุ'],
      channel: 'oid4vp',
      reasonCode: 'timeout',
    })

    expect(row.actionLabel).toBe('แสดงเอกสารไม่สำเร็จ')
    expect(row.subtitle).toContain('หมดเวลา')
    expect(row.status).toBe('failed')
    expect(row.channelCaption).toBe('ดำเนินการใน Wallet')
  })

  test('projectWalletHistoryRow maps deep-link presentation success channel caption', () => {
    const row = projectWalletHistoryRow({
      id: 'e5',
      kind: 'presentation-success',
      status: 'completed',
      occurredAt: '2026-06-05T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'บัตรประชาชน',
      partyName: 'ร้านอาหาร',
      disclosedClaims: ['อายุ'],
      channel: 'oid4vp',
      deliveryPath: 'deep-link',
    })

    expect(row.channelCaption).toBe('ผ่าน Deep link Verifier')
  })

  test('projectWalletHistoryRow maps QR issuance channel caption', () => {
    const row = projectWalletHistoryRow({
      id: 'e6',
      kind: 'credential-received',
      status: 'completed',
      occurredAt: '2026-06-06T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'บัตรประชาชน',
      partyName: 'ThaID',
      disclosedClaims: [],
      channel: 'oid4vci',
      deliveryPath: 'qr',
    })

    expect(row.channelCaption).toBe('ผ่าน QR Issuer')
  })

  test('projectWalletHistoryRow maps deep-link oid4vp failure channel caption', () => {
    const row = projectWalletHistoryRow({
      id: 'e7',
      kind: 'presentation-failed',
      status: 'failed',
      occurredAt: '2026-06-07T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'Thai National ID',
      partyName: 'ร้านอาหาร',
      disclosedClaims: [],
      channel: 'oid4vp',
      credentialType: 'ThaiNationalID',
      reasonCode: 'timeout',
      deliveryPath: 'deep-link',
    })

    expect(row.channelCaption).toBe('ผ่าน Deep link Verifier')
    expect(row.partyName).toBe('ร้านอาหาร')
    expect(row.infoBoxValue).toBe('การตรวจสอบอายุ')
  })

  test('projectWalletHistoryRow prefers disclosed claims over access mock', () => {
    const row = projectWalletHistoryRow({
      id: 'e8',
      kind: 'presentation-success',
      status: 'completed',
      occurredAt: '2026-06-08T00:00:00.000Z',
      credentialId: 'c1',
      documentType: 'Thai National ID',
      partyName: 'Verifier API',
      disclosedClaims: ['วันเดือนปีเกิด'],
      channel: 'oid4vp',
      credentialType: 'ThaiNationalID',
      deliveryPath: 'qr',
    })

    expect(row.partyName).toBe('ร้านอาหาร')
    expect(row.documentType).toBe('บัตรประชาชน')
    expect(row.infoBoxValue).toBe('วันเดือนปีเกิด')
  })
})
