import type { ImageSourcePropType } from 'react-native'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

import { DRIVING_LICENCE_IMAGE, DRIVING_LICENCE_SAMPLE } from '../config/drivingLicenceSample'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { DrivingLicenceDocumentCard } from './DrivingLicenceDocumentCard'

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'นางสาว พิชญา',
    familyName: 'รุ่งเรืองกิจ',
    englishGivenName: 'Pichaya',
    englishFamilyName: 'Rungruangkit',
    birthDate: '15 พฤษภาคม 2530',
    licenceClass: 'รถยนต์ส่วนบุคคล',
    licenceNumber: '54002891',
    issuanceDate: '20 มกราคม 2565',
    expiryDate: '20 มกราคม 2570',
  },
  issuedAt: '2022-01-20T00:00:00.000Z',
}

describe('driving licence sample model', () => {
  test('exports the approved fixed driving-licence copy and portrait image', () => {
    expect(DRIVING_LICENCE_SAMPLE.documentTitle).toBe('DRIVING LICENSE')
    expect(DRIVING_LICENCE_SAMPLE.thaiName).toBe('\u0e19\u0e32\u0e07\u0e2a\u0e32\u0e27 \u0e1e\u0e34\u0e0a\u0e0d\u0e32 \u0e23\u0e38\u0e48\u0e07\u0e40\u0e23\u0e37\u0e2d\u0e07\u0e01\u0e34\u0e15')
    expect(DRIVING_LICENCE_SAMPLE.englishName).toBe('Ms. Thodsopp Eekkasandigital')
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
  test('renders issuer claims on the driving-licence card', () => {
    render(<DrivingLicenceDocumentCard record={drivingLicenceRecord} />)

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
    expect(screen.getByText('DRIVING LICENSE')).toBeTruthy()
    expect(screen.getByText('ประเภทยานพาหนะ')).toBeTruthy()
    expect(screen.queryByText('Type / ประเภท')).toBeNull()
    expect(screen.getByText('นางสาว พิชญา รุ่งเรืองกิจ')).toBeTruthy()
    expect(screen.getByText('54002891')).toBeTruthy()
    expect(screen.getByTestId('driving-licence-image').props.source).toBe(DRIVING_LICENCE_IMAGE)
    expect(screen.getByTestId('driving-licence-expiry')).toHaveTextContent('20 มกราคม 2570')
    expect(screen.getByTestId('driving-licence-expiry').props.accessibilityLabel).toBe(
      'Expiry Date: 20 มกราคม 2570',
    )
  })

  test('renders an optional banner action in the card header', () => {
    render(
      <DrivingLicenceDocumentCard
        record={drivingLicenceRecord}
        bannerAction={<Text>Open credential actions</Text>}
      />,
    )

    expect(screen.getByTestId('document-card-banner-action')).toBeTruthy()
    expect(screen.getByText('Open credential actions')).toBeTruthy()
  })
})
