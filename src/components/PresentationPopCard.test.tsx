import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as Clipboard from 'expo-clipboard'

import { PresentationPopCard } from './PresentationPopCard'

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}))

describe('PresentationPopCard', () => {
  test('copies the signature to the system clipboard', async () => {
    render(<PresentationPopCard signature="real-signature" />)

    fireEvent.press(screen.getByRole('button'))

    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('real-signature')
    })
  })
})
