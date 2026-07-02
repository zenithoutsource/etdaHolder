import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { PinUnlockPrompt } from './PinUnlockPrompt'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PinUnlockPrompt', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  test('submits six digits through the shared unlock surface', () => {
    const onSubmit = jest.fn()

    render(
      <PinUnlockPrompt
        error="Incorrect PIN. Try again."
        onSubmit={onSubmit}
        onBackspace={jest.fn()}
        onBiometricPress={jest.fn()}
        onForgotPin={jest.fn()}
      />,
    )

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }
    act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(onSubmit).toHaveBeenCalledWith('123456')
    expect(screen.getByText('โปรดระบุรหัส PIN 6 หลัก หรือใช้สแกนใบหน้า / ลายนิ้วมือ')).toBeTruthy()
    expect(screen.getByText('Incorrect PIN. Try again.')).toBeTruthy()
  })

  test('can disable retry actions without disabling PIN entry', () => {
    const onSubmit = jest.fn()
    const onBiometricPress = jest.fn()
    const onForgotPin = jest.fn()

    render(
      <PinUnlockPrompt
        actionsDisabled
        onSubmit={onSubmit}
        onBackspace={jest.fn()}
        onBiometricPress={onBiometricPress}
        onForgotPin={onForgotPin}
      />,
    )

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }
    act(() => {
      jest.runOnlyPendingTimers()
    })
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))
    fireEvent.press(screen.getByText('ลืมรหัส PIN?'))

    expect(onSubmit).toHaveBeenCalledWith('123456')
    expect(onBiometricPress).not.toHaveBeenCalled()
    expect(onForgotPin).not.toHaveBeenCalled()
  })
})
