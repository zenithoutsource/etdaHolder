import { fireEvent, render, screen } from '@testing-library/react-native'

import { PinEntryStep } from './PinEntryStep'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PinEntryStep', () => {
  test('code boxes accept pasted digits through hidden input', () => {
    const onFill = jest.fn()

    render(
      <PinEntryStep
        title="Enter Code"
        subtitle="From email"
        pin=""
        onDigit={() => undefined}
        onBackspace={() => undefined}
        allowPaste
        onFill={onFill}
      />,
    )

    fireEvent.changeText(screen.getByTestId('pin-entry-code-boxes-input'), '12-34-56')

    expect(onFill).toHaveBeenCalledWith('123456')
  })

  test('code mode hides keypad and paste button', () => {
    render(
      <PinEntryStep
        title="Enter Code"
        subtitle="From email"
        pin=""
        onDigit={() => undefined}
        onBackspace={() => undefined}
        allowPaste
        onFill={() => undefined}
      />,
    )

    expect(screen.getByTestId('pin-entry-code-boxes')).toBeTruthy()
    expect(screen.queryByTestId('pin-entry-paste-button')).toBeNull()
  })

  test('PIN mode keeps dot indicators and does not render code boxes', () => {
    render(
      <PinEntryStep
        title="PIN"
        subtitle="Enter PIN"
        pin="12"
        onDigit={() => undefined}
        onBackspace={() => undefined}
      />,
    )

    expect(screen.queryByTestId('pin-entry-code-boxes')).toBeNull()
    expect(screen.queryByTestId('pin-entry-code-boxes-input')).toBeNull()
  })
})
