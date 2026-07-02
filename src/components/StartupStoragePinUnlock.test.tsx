import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { StartupStoragePinUnlock } from './StartupStoragePinUnlock'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

const defaultProps = {
  isSubmitting: false,
  fallbackAvailable: true,
  pinUnlockEnabled: true,
  onForgotPin: jest.fn(),
}

describe('StartupStoragePinUnlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      jest.runAllTimers()
    })
    jest.useRealTimers()
  })

  test('submits the six-digit PIN', () => {
    const onSubmit = jest.fn()

    render(
      <StartupStoragePinUnlock
        {...defaultProps}
        onSubmit={onSubmit}
        onRetryBiometric={jest.fn()}
      />,
    )

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }
    act(() => {
      jest.runAllTimers()
    })

    expect(onSubmit).toHaveBeenCalledWith('123456')
    expect(
      screen.getByText('โปรดระบุรหัส PIN 6 หลัก หรือใช้สแกนใบหน้า / ลายนิ้วมือ'),
    ).toBeTruthy()
  })

  test('shows legacy copy when PIN fallback is unavailable', () => {
    render(
      <StartupStoragePinUnlock
        {...defaultProps}
        fallbackAvailable={false}
        pinUnlockEnabled={false}
        onSubmit={jest.fn()}
        onRetryBiometric={jest.fn()}
      />,
    )

    expect(
      screen.getByText('หลังอัปเดต ครั้งแรกให้กดปุ่มลายนิ้วมือด้านล่าง ครั้งถัดไปใช้ PIN ได้เลย'),
    ).toBeTruthy()
  })

  test('accepts PIN entry and keeps biometric retry in the lower-left keypad button', () => {
    const onSubmit = jest.fn()
    const onRetryBiometric = jest.fn()

    render(
      <StartupStoragePinUnlock
        {...defaultProps}
        onSubmit={onSubmit}
        onRetryBiometric={onRetryBiometric}
      />,
    )

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }
    act(() => {
      jest.runAllTimers()
    })
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    expect(onSubmit).toHaveBeenCalledWith('123456')
    expect(onRetryBiometric).toHaveBeenCalledTimes(1)
  })

  test('accepts PIN while startup biometric unlock is in progress', () => {
    const onSubmit = jest.fn()
    const onRetryBiometric = jest.fn()

    render(
      <StartupStoragePinUnlock
        {...defaultProps}
        isSubmitting
        onSubmit={onSubmit}
        onRetryBiometric={onRetryBiometric}
      />,
    )

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }
    act(() => {
      jest.runAllTimers()
    })
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    expect(onSubmit).toHaveBeenCalledWith('123456')
    expect(onRetryBiometric).not.toHaveBeenCalled()
  })

  test('navigates to forgot PIN when the link is pressed', () => {
    const onForgotPin = jest.fn()

    render(
      <StartupStoragePinUnlock
        {...defaultProps}
        onSubmit={jest.fn()}
        onRetryBiometric={jest.fn()}
        onForgotPin={onForgotPin}
      />,
    )

    fireEvent.press(screen.getByText('ลืมรหัส PIN?'))

    expect(onForgotPin).toHaveBeenCalledTimes(1)
  })
})
