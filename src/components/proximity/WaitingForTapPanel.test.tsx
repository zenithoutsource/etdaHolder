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
  test('shows hold instruction and ceiling, not a QR', () => {
    render(
      <WaitingForTapPanel
        ceilingLabels={['family name', 'given name', 'date of birth']}
        onCancel={jest.fn()}
      />,
    )
    expect(screen.getByText('Waiting for Tap...')).toBeTruthy()
    expect(
      screen.getByText(/Hold the phone still on the reader/i),
    ).toBeTruthy()
    expect(screen.getByText(/family name/)).toBeTruthy()
    expect(screen.queryByText(/scan this QR/i)).toBeNull()
  })
})
