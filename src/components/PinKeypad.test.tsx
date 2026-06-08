import { render, screen } from '@testing-library/react-native'

import { PinKeypad } from './PinKeypad'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PinKeypad', () => {
  test('places fingerprint in the lower-left cell with the same key style as number buttons', () => {
    render(
      <PinKeypad
        onDigit={() => undefined}
        onBackspace={() => undefined}
        onFingerprint={() => undefined}
      />
    )

    const keys = screen.getAllByTestId(/^pin-key-/)
    const digitOne = screen.getByTestId('pin-key-1')
    const fingerprint = screen.getByTestId('pin-key-fingerprint')

    expect(keys.map((key) => key.props.testID)).toEqual([
      'pin-key-1',
      'pin-key-2',
      'pin-key-3',
      'pin-key-4',
      'pin-key-5',
      'pin-key-6',
      'pin-key-7',
      'pin-key-8',
      'pin-key-9',
      'pin-key-fingerprint',
      'pin-key-0',
      'pin-key-backspace',
    ])
    expect(fingerprint.props.className).toBe(digitOne.props.className)
  })
})
