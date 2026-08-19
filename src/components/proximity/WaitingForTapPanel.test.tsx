import { render, screen } from '@testing-library/react-native'

import { WaitingForTapPanel } from './WaitingForTapPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockIcon() {
    return null
  }
})

jest.mock('react-native-qrcode-svg', () => {
  return function MockQR() {
    throw new Error('QR must not render on tap-only waiting panel')
  }
})

describe('WaitingForTapPanel', () => {
  test('shows hold instruction without a field list or QR', () => {
    render(<WaitingForTapPanel onCancel={jest.fn()} />)
    expect(screen.getByText('รอการแตะเครื่องอ่าน...')).toBeTruthy()
    expect(screen.getByText(/วางโทรศัพท์นิ่งบนเครื่องอ่าน/)).toBeTruthy()
    expect(screen.getByText('ยกเลิก')).toBeTruthy()
    expect(screen.queryByText(/This tap may share/i)).toBeNull()
    expect(screen.queryByText(/family name/i)).toBeNull()
    expect(screen.queryByText(/scan this QR/i)).toBeNull()
  })

  test('shows Thai preparing copy while NFC arms', () => {
    render(<WaitingForTapPanel preparing onCancel={jest.fn()} />)
    expect(screen.getByText('กำลังเตรียม NFC…')).toBeTruthy()
    expect(screen.getByText(/จนกว่า NFC จะพร้อม/)).toBeTruthy()
  })
})
