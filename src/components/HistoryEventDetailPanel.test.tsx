import { render, screen } from '@testing-library/react-native'

import { HistoryEventDetailPanel } from './HistoryEventDetailPanel'
import type { WalletHistoryRow } from '../services/history/walletHistory'

const baseRow: WalletHistoryRow = {
  id: 'history-1',
  credentialId: 'credential-1',
  title: 'แสดงเอกสารสำเร็จ',
  subtitle: 'ข้อมูลที่เปิดเผย: นามสกุล',
  partyName: 'เครื่องอ่าน NFC',
  documentType: 'ใบอนุญาตขับขี่',
  actionLabel: 'แสดงเอกสารสำเร็จ',
  occurredAt: '2026-07-17T00:00:00.000Z',
  status: 'completed',
  kind: 'nfc-presentation-success',
  channel: 'nfc',
  disclosedClaims: ['นามสกุล'],
  channelCaption: 'ผ่าน NFC',
  infoBoxLabel: 'ประเภทข้อมูลที่เข้าถึง',
  infoBoxValue: 'นามสกุล',
  partyRoleLabel: 'ผู้ตรวจสอบ',
  showSuspendAccessButton: false,
  credentialType: 'DLTDrivingLicence',
}

describe('HistoryEventDetailPanel issuer logo', () => {
  test('renders the DLT agency logo next to the party name', () => {
    render(<HistoryEventDetailPanel row={baseRow} />)

    expect(screen.getByTestId('history-event-issuer-logo').props.source).toEqual(
      require('../../assets/images/dltt.png'),
    )
    expect(screen.getByText('เครื่องอ่าน NFC')).toBeTruthy()
  })
})
