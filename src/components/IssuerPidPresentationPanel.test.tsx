import { fireEvent, render, screen } from '@testing-library/react-native'

import { IssuerPidPresentationPanel } from './IssuerPidPresentationPanel'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons')

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({ credentials: [] }),
}))

const pidRecord: VerifiableCredentialRecord = {
  id: 'pid-1',
  type: 'ThaiNationalID',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'สมชาย',
    familyName: 'ใจดี',
    nationalId: '1234567890123',
  },
  issuedAt: '2026-01-01T00:00:00.000Z',
}

describe('IssuerPidPresentationPanel', () => {
  test('renders the stored PID card, explanation, and confirm/decline actions', () => {
    const onConfirm = jest.fn()
    const onDecline = jest.fn()

    render(
      <IssuerPidPresentationPanel
        record={pidRecord}
        onConfirm={onConfirm}
        onDecline={onDecline}
      />,
    )

    expect(screen.getByTestId('issuer-pid-presentation-panel')).toBeTruthy()
    expect(screen.getByTestId('document-detail-card')).toBeTruthy()
    expect(
      screen.getByText(
        'หน้านี้ใช้ส่งบัตรประจำตัวประชาชนดิจิทัล (PID) ให้ Issuer ตรวจสอบตัวตนก่อนออกเอกสารอื่น',
      ),
    ).toBeTruthy()
    expect(screen.getByText('ยืนยัน')).toBeTruthy()
    expect(screen.getByText('ไม่ยินยอม')).toBeTruthy()
    expect(screen.queryByText('scan-face')).toBeNull()
    expect(screen.queryByText('รับทราบและยินยอมส่งข้อมูล')).toBeNull()

    fireEvent.press(screen.getByText('ยืนยัน'))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('ไม่ยินยอม'))
    expect(onDecline).toHaveBeenCalledTimes(1)
  })
})
