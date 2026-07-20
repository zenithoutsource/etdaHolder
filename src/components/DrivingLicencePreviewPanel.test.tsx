import { fireEvent, render, screen } from '@testing-library/react-native'

import { DRIVING_LICENCE_SAMPLE } from '../config/drivingLicenceSample'
import { DrivingLicencePreviewPanel } from './DrivingLicencePreviewPanel'

describe('DrivingLicencePreviewPanel', () => {
  test('renders the fixed card and calls onAccept', () => {
    const onAccept = jest.fn()

    render(<DrivingLicencePreviewPanel onAccept={onAccept} />)

    expect(screen.getByTestId('driving-licence-preview-panel')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-card')).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.documentTitle)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.thaiName)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.licenceNumber)).toBeTruthy()
    expect(screen.getByTestId('driving-licence-expiry')).toHaveTextContent(
      DRIVING_LICENCE_SAMPLE.expiryDate,
    )

    fireEvent.press(screen.getByText('ยอมรับ'))

    expect(onAccept).toHaveBeenCalledTimes(1)
  })
})
