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
})
