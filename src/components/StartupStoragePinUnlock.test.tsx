import { fireEvent, render, screen } from '@testing-library/react-native'

import { STARTUP_PIN_UNLOCK_DISABLED_MESSAGE } from '@/src/services/startup/startupState'

import { StartupStoragePinUnlock } from './StartupStoragePinUnlock'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

const defaultProps = {
  pinUnlockEnabled: true,
  isSubmitting: false,
  onForgotPin: jest.fn(),
}

describe('StartupStoragePinUnlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('submits the six-digit PIN when PIN unlock is enabled', () => {
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

    expect(onSubmit).toHaveBeenCalledWith('123456')
    expect(screen.queryByText(STARTUP_PIN_UNLOCK_DISABLED_MESSAGE)).toBeNull()
  })

  test('disables PIN entry and shows helper text when PIN unlock is unavailable', () => {
    const onSubmit = jest.fn()
    const onRetryBiometric = jest.fn()

    render(
      <StartupStoragePinUnlock
        {...defaultProps}
        pinUnlockEnabled={false}
        onSubmit={onSubmit}
        onRetryBiometric={onRetryBiometric}
      />,
    )

    expect(screen.getByText(STARTUP_PIN_UNLOCK_DISABLED_MESSAGE)).toBeTruthy()

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onRetryBiometric).toHaveBeenCalledTimes(1)
  })

  test('accepts PIN while startup biometric unlock is in progress when PIN unlock is enabled', () => {
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
