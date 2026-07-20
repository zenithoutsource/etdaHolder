import type { ImageSourcePropType } from 'react-native'
import { render, screen } from '@testing-library/react-native'

import { DRIVING_LICENCE_IMAGE, DRIVING_LICENCE_SAMPLE } from '../config/drivingLicenceSample'
import { DrivingLicenceDocumentCard } from './DrivingLicenceDocumentCard'

describe('driving licence sample model', () => {
  test('exports the approved fixed driving-licence copy and portrait image', () => {
    expect(DRIVING_LICENCE_SAMPLE.documentTitle).toBe('DRIVING LICENSE')
    expect(DRIVING_LICENCE_SAMPLE.thaiName).toBe('\u0e19\u0e32\u0e07\u0e2a\u0e32\u0e27 \u0e1e\u0e34\u0e0a\u0e0d\u0e32 \u0e23\u0e38\u0e48\u0e07\u0e40\u0e23\u0e37\u0e2d\u0e07\u0e01\u0e34\u0e15')
    expect(DRIVING_LICENCE_SAMPLE.englishName).toBe('Ms. Pichaya Rungruangkit')
    expect(DRIVING_LICENCE_SAMPLE.birthDate).toBe('15 \u0e1e\u0e24\u0e29\u0e20\u0e32\u0e04\u0e21 2530')
    expect(DRIVING_LICENCE_SAMPLE.type).toBe('\u0e23\u0e16\u0e22\u0e19\u0e15\u0e4c\u0e2a\u0e48\u0e27\u0e19\u0e1a\u0e38\u0e04\u0e04\u0e25')
    expect(DRIVING_LICENCE_SAMPLE.englishType).toBe('Private Motor Car')
    expect(DRIVING_LICENCE_SAMPLE.licenceNumber).toBe('54002891')
    expect(DRIVING_LICENCE_SAMPLE.issueDate).toBe('20 \u0e21\u0e01\u0e23\u0e32\u0e04\u0e21 2565')
    expect(DRIVING_LICENCE_SAMPLE.expiryDate).toBe('20 \u0e21\u0e01\u0e23\u0e32\u0e04\u0e21 2570')
    expect(DRIVING_LICENCE_IMAGE as ImageSourcePropType).toEqual(
      require('../../assets/images/user_profile.png'),
    )
  })
})

describe('DrivingLicenceDocumentCard', () => {
  test('renders the fixed driving-licence reference card', () => {
    render(<DrivingLicenceDocumentCard />)

    expect(screen.getByTestId('driving-licence-card')).toBeTruthy()
    expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner')).toBeTruthy()
    expect(screen.getByTestId('document-card-hero')).toBeTruthy()
    expect(screen.getByTestId('document-card-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-card-divider')).toBeTruthy()
    expect(screen.getByTestId('document-card-right-column')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-header')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-hero')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-left-column')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-right-column')).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.documentTitle)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.thaiName)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.englishName)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.birthDate)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.type)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.englishType)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.licenceNumber)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.issueDate)).toBeTruthy()
    expect(screen.getByTestId('driving-licence-image').props.source).toBe(DRIVING_LICENCE_IMAGE)
    expect(screen.getByTestId('driving-licence-expiry').props.children).toBe(
      DRIVING_LICENCE_SAMPLE.expiryDate,
    )
    expect(screen.getByTestId('driving-licence-expiry').props.accessibilityLabel).toBe(
      `Expiry Date: ${DRIVING_LICENCE_SAMPLE.expiryDate}`,
    )
  })
})
