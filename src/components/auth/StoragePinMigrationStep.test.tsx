import { fireEvent, render, screen } from '@testing-library/react-native'

import { StoragePinMigrationStep } from './StoragePinMigrationStep'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

jest.mock('@/src/services/auth/walletPin', () => ({
  verifyWalletPin: jest.fn(),
  setWalletPin: jest.fn(),
}))

jest.mock('@/src/services/debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
}))

const { verifyWalletPin, setWalletPin } = jest.requireMock('@/src/services/auth/walletPin') as {
  verifyWalletPin: jest.Mock
  setWalletPin: jest.Mock
}

describe('StoragePinMigrationStep', () => {
  const onBeginBiometric = jest.fn()
  const onComplete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    verifyWalletPin.mockReturnValue(true)
  })

  test('shows biometric step and starts migration unlock', () => {
    render(
      <StoragePinMigrationStep
        step="biometric"
        onBeginBiometric={onBeginBiometric}
        onComplete={onComplete}
      />,
    )

    expect(screen.getByText('ขั้นที่ 1/2')).toBeTruthy()
    expect(screen.getByText('อัปเดตความปลอดภัย')).toBeTruthy()
    fireEvent.press(screen.getByTestId('migration-biometric-button'))
    expect(onBeginBiometric).toHaveBeenCalledTimes(1)
  })

  test('calls onComplete after a valid PIN is entered on step pin', () => {
    render(
      <StoragePinMigrationStep
        step="pin"
        onBeginBiometric={onBeginBiometric}
        onComplete={onComplete}
      />,
    )

    expect(screen.getByText('ขั้นที่ 2/2')).toBeTruthy()

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }

    expect(verifyWalletPin).toHaveBeenCalledWith('123456')
    expect(setWalletPin).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  test('shows an error when the PIN does not match the local wallet PIN', () => {
    verifyWalletPin.mockReturnValue(false)

    render(
      <StoragePinMigrationStep
        step="pin"
        onBeginBiometric={onBeginBiometric}
        onComplete={onComplete}
      />,
    )

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }

    expect(screen.getByText('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')).toBeTruthy()
    expect(setWalletPin).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
