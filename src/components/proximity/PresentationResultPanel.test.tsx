import { render, screen } from '@testing-library/react-native'

import { PresentationResultPanel } from './PresentationResultPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('proximity PresentationResultPanel', () => {
  test('reuses the OID4VP success copy and NFC reader party name', () => {
    render(<PresentationResultPanel onDone={jest.fn()} />)

    expect(screen.getByText('ตรวจสอบสำเร็จ')).toBeTruthy()
    expect(screen.getByText(/ข้อมูลของคุณถูกส่งให้/)).toBeTruthy()
    expect(screen.getByText(/เครื่องอ่าน NFC/)).toBeTruthy()
    expect(screen.getByText('เสร็จสิ้น')).toBeTruthy()
    expect(screen.queryByText(/Shared/)).toBeNull()
  })

  test('does not list sent or omitted claim fields on NFC success', () => {
    render(
      <PresentationResultPanel
        credentialType="DLTDrivingLicence"
        sharedFields={['org.iso.18013.5.1.given_name']}
        omittedFields={[{ key: 'org.iso.18013.5.1.family_name', reason: 'holder_declined' }]}
        onDone={jest.fn()}
      />,
    )
    expect(screen.getByText('ตรวจสอบสำเร็จ')).toBeTruthy()
    expect(screen.queryByText('ชื่อ')).toBeNull()
    expect(screen.queryByText('นามสกุล')).toBeNull()
    expect(screen.queryByText('วันเดือนปีเกิด')).toBeNull()
    expect(screen.queryByText(/ไม่ได้ส่ง/)).toBeNull()
    expect(screen.queryByText(/ผู้ถือบัตรไม่ยินยอมเปิดเผย/)).toBeNull()
  })
})
