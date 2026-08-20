import { fireEvent, render, screen } from '@testing-library/react-native'
import { Image, Text } from 'react-native'

import { CredentialDocumentDetailCard } from './CredentialDocumentDetailCard'
import type { CredentialDetailDisplay } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

import { THEME } from '../config/themeColors'
import { DRIVING_LICENCE_SAMPLE } from '../config/drivingLicenceSample'
import { isStoredCredentialKeyTtlExpired } from '../services/credentials/credentialKeyExpiry'

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: {
    thaiFullName: DRIVING_LICENCE_SAMPLE.thaiName,
    englishFullName: DRIVING_LICENCE_SAMPLE.englishName,
    birthDate: DRIVING_LICENCE_SAMPLE.birthDate,
    licenceClass: DRIVING_LICENCE_SAMPLE.type,
    licenceNumber: DRIVING_LICENCE_SAMPLE.licenceNumber,
    issuanceDate: DRIVING_LICENCE_SAMPLE.issueDate,
    expiryDate: DRIVING_LICENCE_SAMPLE.expiryDate,
  },
  issuedAt: '2022-01-20T00:00:00.000Z',
}

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons')

jest.mock('../services/credentials/credentialKeyExpiry', () => ({
  isStoredCredentialKeyTtlExpired: jest.fn(() => false),
}))

const isStoredCredentialKeyTtlExpiredMock = isStoredCredentialKeyTtlExpired as jest.MockedFunction<
  typeof isStoredCredentialKeyTtlExpired
>

const ReactNativeImage = Image as unknown as {
  resolveAssetSource: (source: unknown) => unknown
}

function expectSharedDocumentCardLayout() {
  expect(screen.getByTestId('document-card-layout')).toBeTruthy()
  expect(screen.getByTestId('document-card-banner')).toBeTruthy()
  expect(screen.getByTestId('document-card-hero')).toBeTruthy()
  expect(screen.getByTestId('document-card-left-column')).toBeTruthy()
  expect(screen.getByTestId('document-card-divider')).toBeTruthy()
  expect(screen.getByTestId('document-card-right-column')).toBeTruthy()
}

const display: CredentialDetailDisplay = {
  title: 'Thai National ID',
  documentTitle: 'ID CARD',
  issuerName: 'Department of Provincial Administration',
  primaryColor: THEME.navy,
  imageKey: 'id',
  primaryText: 'Pitchaya Rungruangkit',
  rows: [],
  issuedAt: '2026-06-08T00:00:00.000Z',
  primaryRows: [
    { key: 'givenName', label: 'Given Name', value: 'Pitchaya' },
    { key: 'familyName', label: 'Family Name', value: 'Rungruangkit' },
    { key: 'nationalId', label: 'ID Number', value: '1-1009-000XX-XX-XX' },
    { key: 'birthDate', label: 'Date of Birth', value: '2003-05-15' },
  ],
  extraRows: [
    { key: 'address', label: 'Address', value: 'Bangkok' },
    { key: 'religion', label: 'Religion', value: 'Buddhist' },
  ],
}

describe('CredentialDocumentDetailCard', () => {
  beforeEach(() => {
    isStoredCredentialKeyTtlExpiredMock.mockReset()
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(false)
  })
  test('renders the wallet document detail structure from the HTML reference', () => {
    render(
      <CredentialDocumentDetailCard
        display={display}
        holderProfile={{ thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ', englishName: 'Miss Pitchaya Rungruangkit' }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-card')).toBeTruthy()
    expectSharedDocumentCardLayout()
    expect(screen.getByTestId('document-detail-band')).toHaveTextContent('ID CARD')
    expect(screen.getByTestId('document-detail-hero')).toBeTruthy()
    expect(screen.getByTestId('document-detail-photo')).toBeTruthy()
    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('Miss Pitchaya Rungruangkit')
    expect(screen.getByTestId('document-detail-primary-id')).toHaveTextContent('1-1009-000XX-XX-XX')
    expect(screen.getByTestId('document-detail-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-detail-right-column')).toBeTruthy()
    expect(screen.getByTestId('document-detail-my-qr')).toHaveTextContent('My QR')
  })

  test('renders NFC presentation action beside My QR when provided', () => {
    render(
      <CredentialDocumentDetailCard
        display={display}
        holderProfile={{ thaiName: 'เธเธฒเธเธชเธฒเธง เธเธดเธเธเธฒ เธฃเธธเนเธเน€เธฃเธทเธญเธเธเธดเธ', englishName: 'Miss Pitchaya Rungruangkit' }}
        onOpenQr={() => undefined}
        onPresentViaNfc={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-present-nfc')).toHaveTextContent('NFC')
    expect(screen.getByTestId('document-detail-my-qr')).toHaveTextContent('My QR')
  })

  test('renders ID card detail fields from idcard reference aliases', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          primaryRows: [
            { key: 'birthDate', label: 'Date of Birth', value: '2003-05-15' },
            { key: 'nationalId', label: 'ID Number', value: '1-1009-000XX-XX-XX' },
            { key: 'religion', label: 'Religion', value: 'พุทธ' },
            { key: 'address', label: 'Address', value: '123/45 ถนนราชดำเนิน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200' },
            { key: 'issuanceDate', label: 'Issue Date', value: '2018-09-08' },
            { key: 'expiryDate', label: 'Expiry Date', value: '2027-08-27' },
          ],
          extraRows: [],
        }}
        holderProfile={{ thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ', englishName: 'Miss Pitchaya Rungruangkit' }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-band')).toHaveTextContent('ID CARD')
    expect(screen.getByText('15 พฤษภาคม 2546')).toBeTruthy()
    expect(screen.queryByText('ศาสนา')).toBeNull()
    expect(screen.queryByText('พุทธ')).toBeNull()
    expect(screen.getByText('8 กันยายน 2561')).toBeTruthy()
    expect(screen.getByText('27 สิงหาคม 2570')).toBeTruthy()
  })

  test('resolves ID card values from Thai display labels when claim keys are unfamiliar', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          primaryRows: [
            { key: 'holderCode', label: 'เลขบัตรประจำตัวประชาชน', value: '9-9999-99999-99-9' },
            { key: 'belief', label: 'ศาสนา', value: 'Buddhist' },
            { key: 'home', label: 'ที่อยู่ตามบัตรประชาชน', value: 'Bangkok residence' },
            { key: 'validUntil', label: 'วันหมดอายุ', value: '2030-11-28' },
          ],
          extraRows: [],
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-primary-id')).toHaveTextContent('9-9999-99999-99-9')
    expect(screen.queryByText('ศาสนา')).toBeNull()
    expect(screen.queryByText('Buddhist')).toBeNull()
    expect(screen.getByText('Bangkok residence')).toBeTruthy()
    expect(screen.getByText('28 พฤศจิกายน 2573')).toBeTruthy()
  })

  test('hides religion and does not invent English name when PID claims omit them', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          primaryRows: [
            { key: 'birthDate', label: 'Date of Birth', value: '2003-05-15' },
            { key: 'nationalId', label: 'ID Number', value: '1-1009-000XX-XX-XX' },
          ],
          extraRows: [],
        }}
        holderProfile={{ thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ' }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('-')
    expect(screen.queryByText('ศาสนา')).toBeNull()
    expect(screen.queryByText('พุทธ')).toBeNull()
    expect(screen.getByText('123/45 ถนนราชดำเนิน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200')).toBeTruthy()
  })

  test('uses the profile photo asset for transcript and fills the image frame', () => {
    const userProfileSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/user_profile.png'))
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
        }}
        onOpenQr={() => undefined}
      />
    )

    const image = screen.getByTestId('document-detail-image')
    expect(image.props.resizeMode).toBe('cover')
    expect(image.props.className).toContain('h-[112px]')
    expect(image.props.className).toContain('w-[88px]')
    expect(image.props.className).toContain('rounded-lg')
    expect(ReactNativeImage.resolveAssetSource(image.props.source)).toEqual(
      userProfileSource
    )
  })

  test('renders transcript detail with Thai labels from the transcript reference', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          primaryText: 'Pitchaya Rungruangkit',
          primaryRows: [
            { key: 'givenName', label: 'Given Name', value: 'Pitchaya' },
            { key: 'familyName', label: 'Family Name', value: 'Rungruangkit' },
            { key: 'birthDate', label: 'Date of Birth', value: '15 พฤษภาคม 2530' },
            { key: 'studentId', label: 'Student ID', value: '6304012022' },
            { key: 'faculty', label: 'Faculty', value: 'วิศวกรรมศาสตร์' },
            { key: 'degree', label: 'Degree', value: 'วิศวกรรมคอมพิวเตอร์' },
            { key: 'gpa', label: 'GPA', value: '3.75' },
          ],
          extraRows: [
            { key: 'graduationYear', label: 'Graduation Year', value: '2025' },
            { key: 'expiryDate', label: 'Expiry Date', value: '28 พฤศจิกายน 2573' },
          ],
        }}
        holderProfile={{ thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ', englishName: 'Ms. Thodsopp Eekkasandigital' }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-band')).toHaveTextContent('TRANSCRIPT')
    expectSharedDocumentCardLayout()
    expect(screen.getByText('เลขประจำตัวนิสิต')).toBeTruthy()
    expect(screen.getByText('คณะ')).toBeTruthy()
    expect(screen.getByText('สาขาวิชา')).toBeTruthy()
    expect(screen.getByText('6304012022')).toBeTruthy()
    expect(screen.getByText('3.75')).toBeTruthy()
    expect(screen.getByText('2025')).toBeTruthy()
    expect(screen.getByText('28 พฤศจิกายน 2573')).toBeTruthy()
    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('Ms. Thodsopp Eekkasandigital')
  })

  test('resolves transcript values from Thai display labels when claim keys are unfamiliar', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          primaryRows: [
            { key: 'enrollmentCode', label: 'เลขประจำตัวนิสิต', value: '6304012022' },
            { key: 'schoolUnit', label: 'คณะ', value: 'Engineering' },
            { key: 'studyTrack', label: 'สาขาวิชา', value: 'Computer Engineering' },
          ],
          extraRows: [],
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByText('6304012022')).toBeTruthy()
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('Computer Engineering')).toBeTruthy()
  })

  test('uses credential expiry metadata when transcript expiry claim is absent', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          expiresAt: '2030-11-28T00:00:00.000Z',
          primaryRows: [
            { key: 'givenName', label: 'Given Name', value: 'Pitchaya' },
            { key: 'familyName', label: 'Family Name', value: 'Rungruangkit' },
            { key: 'studentId', label: 'Student ID', value: '6304012022' },
          ],
          extraRows: [],
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByText('28 พฤศจิกายน 2573')).toBeTruthy()
  })

  test('uses ID card holder profile as transcript name and birth date fallback', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          primaryText: 'Academic Transcript',
          primaryRows: [{ key: 'studentId', label: 'Student ID', value: '6304012022' }],
          extraRows: [],
        }}
        holderProfile={{
          thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
          englishName: 'Ms. Thodsopp Eekkasandigital',
          birthDate: '1990-05-15',
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('Ms. Thodsopp Eekkasandigital')
    expect(screen.getByText('15 พฤษภาคม 2533')).toBeTruthy()
  })

  test('shows English holder name on the primary name line when Thai name is unavailable', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          primaryText: 'Academic Transcript',
          primaryRows: [],
          extraRows: [],
        }}
        holderProfile={{
          englishName: 'Ms. Thodsopp Eekkasandigital',
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('Ms. Thodsopp Eekkasandigital')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('-')
  })

  test('shows dash for transcript English name when holder profile omits it', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          primaryText: 'Academic Transcript',
          primaryRows: [],
          extraRows: [],
        }}
        holderProfile={{
          thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('-')
  })

  test('uses the driving-licence card from issuer claims and retains document actions', () => {
    const onOpenQr = jest.fn()
    const onPresentViaNfc = jest.fn()

    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Driving Licence',
          documentTitle: 'DRIVING LICENSE',
          imageKey: 'car',
          primaryColor: THEME.navyRoyal,
        }}
        record={drivingLicenceRecord}
        onOpenQr={onOpenQr}
        onPresentViaNfc={onPresentViaNfc}
      />
    )

    expect(screen.getByTestId('driving-licence-card')).toBeTruthy()
    expectSharedDocumentCardLayout()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.documentTitle)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.thaiName)).toBeTruthy()
    expect(screen.getByText(DRIVING_LICENCE_SAMPLE.licenceNumber)).toBeTruthy()
    expect(screen.getByTestId('driving-licence-expiry')).toHaveTextContent(
      DRIVING_LICENCE_SAMPLE.expiryDate,
    )

    fireEvent.press(screen.getByTestId('document-detail-my-qr'))
    fireEvent.press(screen.getByTestId('document-detail-present-nfc'))

    expect(onOpenQr).toHaveBeenCalledTimes(1)
    expect(onPresentViaNfc).toHaveBeenCalledTimes(1)
  })

  test('places a banner action on the driving-licence card header', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Driving Licence',
          documentTitle: 'DRIVING LICENSE',
          imageKey: 'car',
          primaryColor: THEME.navyRoyal,
        }}
        record={drivingLicenceRecord}
        bannerAction={<Text>Open credential actions</Text>}
      />,
    )

    expect(screen.getByTestId('document-card-banner-action')).toBeTruthy()
    expect(screen.getByText('Open credential actions')).toBeTruthy()
  })

  test('adds bottom clearance on suspended ID Card and Transcript but not Driving Licence', () => {
    const suspended = {
      kind: 'issuer-suspended' as const,
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-danger',
      panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
    }

    const { unmount: unmountId } = render(
      <CredentialDocumentDetailCard
        display={display}
        inactiveState={suspended}
        onOpenQr={() => undefined}
      />,
    )
    expect(screen.getByTestId('document-card-columns').props.className).toContain('pb-12')
    unmountId()

    const { unmount: unmountTranscript } = render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
        }}
        inactiveState={suspended}
        onOpenQr={() => undefined}
      />,
    )
    expect(screen.getByTestId('document-card-columns').props.className).toContain('pb-12')
    unmountTranscript()

    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Driving Licence',
          documentTitle: 'DRIVING LICENSE',
          imageKey: 'car',
          primaryColor: THEME.navyRoyal,
        }}
        record={drivingLicenceRecord}
        inactiveState={suspended}
        onOpenQr={() => undefined}
      />,
    )
    expect(screen.getByTestId('document-card-columns').props.className).toBe(
      'flex-row px-4 py-4',
    )
  })

  test('hides My QR and NFC when the document is expired even if handlers are passed', () => {
    const expired = {
      kind: 'document-expired' as const,
      badgeLabel: 'หมดอายุ',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
    }

    render(
      <CredentialDocumentDetailCard
        display={display}
        inactiveState={expired}
        onOpenQr={() => undefined}
        onPresentViaNfc={() => undefined}
      />,
    )

    expect(screen.queryByTestId('document-detail-my-qr')).toBeNull()
    expect(screen.queryByTestId('document-detail-present-nfc')).toBeNull()
  })

  test('hides My QR on expired driving licence even if onOpenQr is passed', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Driving Licence',
          documentTitle: 'DRIVING LICENSE',
          imageKey: 'car',
          primaryColor: THEME.navyRoyal,
        }}
        record={drivingLicenceRecord}
        inactiveState={{
          kind: 'document-expired',
          badgeLabel: 'หมดอายุ',
          badgeClassName: 'bg-gray-badge',
          panelMessage: 'เอกสารหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
        }}
        onOpenQr={() => undefined}
      />,
    )

    expect(screen.queryByTestId('document-detail-my-qr')).toBeNull()
  })

  test('hides My QR and NFC when renewed-active k_cred TTL has elapsed', () => {
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(true)

    render(
      <CredentialDocumentDetailCard
        display={display}
        record={{
          id: 'transcript-new',
          type: 'ChulalongkornUniversityTranscript',
          rawVc: 'header.payload.signature',
          claims: {},
          issuedAt: '2026-08-19T10:00:00.000Z',
          expiresAt: '2030-06-15T00:00:00.000Z',
        }}
        inactiveState={{ kind: 'active' }}
        onOpenQr={() => undefined}
        onPresentViaNfc={() => undefined}
      />,
    )

    expect(screen.queryByTestId('document-detail-my-qr')).toBeNull()
    expect(screen.queryByTestId('document-detail-present-nfc')).toBeNull()
  })
})
