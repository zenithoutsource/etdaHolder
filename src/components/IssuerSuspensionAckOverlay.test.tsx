import { fireEvent, render, screen } from '@testing-library/react-native'

import { IssuerSuspensionAckOverlay } from './IssuerSuspensionAckOverlay'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons')

describe('IssuerSuspensionAckOverlay', () => {
  test('renders suspended messaging and triggers acknowledge action', () => {
    const onAcknowledge = jest.fn()
    const onBack = jest.fn()

    render(
      <IssuerSuspensionAckOverlay
        title="Academic Transcript"
        onAcknowledge={onAcknowledge}
        onBack={onBack}
      />,
    )

    expect(screen.getByText('Document suspended')).toBeTruthy()
    expect(screen.getByText('Academic Transcript')).toBeTruthy()

    fireEvent.press(screen.getByText('รับทราบการระงับ'))
    fireEvent.press(screen.getByText('Back'))

    expect(onAcknowledge).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
