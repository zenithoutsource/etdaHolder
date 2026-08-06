import { fireEvent, render, screen } from '@testing-library/react-native'

import { PinEntrySurface } from './PinEntrySurface'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PinEntrySurface', () => {
  test('renders shared PIN dots, error text, status text, and keypad', () => {
    const onDigit = jest.fn()

    render(
      <PinEntrySurface
        title="Enter PIN"
        subtitle="Use your PIN"
        pin="12"
        error="Incorrect PIN"
        status="Checking..."
        onDigit={onDigit}
        onBackspace={jest.fn()}
        onFingerprint={jest.fn()}
      />,
    )

    expect(screen.getByText('Enter PIN')).toBeTruthy()
    expect(screen.getByText('Use your PIN')).toBeTruthy()
    expect(screen.getByText('Incorrect PIN')).toBeTruthy()
    expect(screen.getByText('Checking...')).toBeTruthy()

    fireEvent.press(screen.getByTestId('pin-key-3'))
    expect(onDigit).toHaveBeenCalledWith('3')
  })

  test('renders code boxes instead of keypad when paste mode is enabled', () => {
    const onFill = jest.fn()

    render(
      <PinEntrySurface
        title="Code"
        subtitle="Email code"
        pin=""
        allowPaste
        onFill={onFill}
        onDigit={jest.fn()}
        onBackspace={jest.fn()}
        onFingerprint={jest.fn()}
      />,
    )

    expect(screen.getByTestId('pin-entry-code-boxes')).toBeTruthy()
    expect(screen.queryByTestId('pin-key-1')).toBeNull()

    fireEvent.changeText(screen.getByTestId('pin-entry-code-boxes-input'), '12-34-56')
    expect(onFill).toHaveBeenCalledWith('123456')
  })
})
