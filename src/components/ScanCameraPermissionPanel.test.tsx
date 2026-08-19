import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { ScanCameraPermissionPanel } from './ScanCameraPermissionPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

describe('ScanCameraPermissionPanel', () => {
  test('explains camera use and requests permission', () => {
    const onAllow = jest.fn()
    render(<ScanCameraPermissionPanel canAskAgain onAllow={onAllow} />)

    expect(screen.getByTestId('scan-camera-permission-panel')).toBeTruthy()
    expect(screen.getByText('อนุญาตให้ใช้กล้อง')).toBeTruthy()
    expect(screen.getByText('สแกน QR เพื่อรับเอกสารใหม่')).toBeTruthy()
    expect(screen.getByText('สแกน QR จากผู้ตรวจสอบเพื่อแสดงเอกสาร')).toBeTruthy()
    expect(screen.getByText(/ไม่เก็บรูปของคุณ/)).toBeTruthy()

    fireEvent.press(screen.getByText('อนุญาตใช้กล้อง'))
    expect(onAllow).toHaveBeenCalledTimes(1)
  })

  test('opens system settings when the system will not ask again', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    const onAllow = jest.fn()

    render(<ScanCameraPermissionPanel canAskAgain={false} onAllow={onAllow} />)

    expect(screen.getByText('เปิดสิทธิ์กล้องในการตั้งค่า')).toBeTruthy()
    fireEvent.press(screen.getByText('เปิดการตั้งค่า'))

    expect(onAllow).not.toHaveBeenCalled()
    expect(openSettings).toHaveBeenCalledTimes(1)
    openSettings.mockRestore()
  })
})
