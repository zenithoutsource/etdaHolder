import { fireEvent, render, screen } from '@testing-library/react-native'

import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { DrivingLicencePreviewPanel } from './DrivingLicencePreviewPanel'

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'สมชาย',
    familyName: 'ใจดี',
    licenceNumber: '54002891',
    expiryDate: '20 มกราคม 2570',
  },
  issuedAt: '2024-01-20T00:00:00.000Z',
}

describe('DrivingLicencePreviewPanel', () => {
  test('renders issuer claims and calls onAccept', () => {
    const onAccept = jest.fn()

    render(<DrivingLicencePreviewPanel record={drivingLicenceRecord} onAccept={onAccept} />)

    expect(screen.getByTestId('driving-licence-preview-panel')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-card')).toBeTruthy()
    expect(screen.getByText('DRIVING LICENSE')).toBeTruthy()
    expect(screen.getByText('สมชาย ใจดี')).toBeTruthy()
    expect(screen.getByText('54002891')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-expiry')).toHaveTextContent('20 มกราคม 2570')

    fireEvent.press(screen.getByText('ยอมรับ'))

    expect(onAccept).toHaveBeenCalledTimes(1)
  })
})
