import { fireEvent, render, screen } from '@testing-library/react-native'
import { Image, StyleSheet } from 'react-native'

import { THEME } from '../config/themeColors'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { IssuanceTrustConfirmationPanel } from './IssuanceTrustConfirmationPanel'

const ReactNativeImage = Image as unknown as { resolveAssetSource: (source: unknown) => unknown }

const records: Record<string, VerifiableCredentialRecord> = {
  drivingLicence: {
    id: 'driving-licence-1',
    type: 'DLTDrivingLicence',
    rawVc: 'vc',
    claims: {},
    issuedAt: '2026-06-09T00:00:00.000Z',
  },
  transcript: {
    id: 'transcript-1',
    type: 'ChulalongkornUniversityTranscript',
    rawVc: 'vc',
    claims: {},
    issuedAt: '2026-06-09T00:00:00.000Z',
  },
}

describe('IssuanceTrustConfirmationPanel', () => {
  test('renders the fixed PID confirmation before a credential record exists', () => {
    const onConfirm = jest.fn()
    const dopaSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/dopa.png'))

    render(
      <IssuanceTrustConfirmationPanel
        variant="pidDopa"
        credentialType="ThaiNationalID"
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByTestId('trust-confirmation-content').props.className).toContain('items-center')
    expect(screen.getByTestId('trust-confirmation-card').props.className).toContain('max-w-[340px]')
    expect(StyleSheet.flatten(screen.getByTestId('trust-confirmation-card').props.style)).toEqual(
      expect.objectContaining({ borderColor: THEME.navy }),
    )
    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('thai-id-confirmation-image').props.source)).toEqual(dopaSource)
    expect(screen.getByText('กรมการปกครอง')).toBeTruthy()
    expect(screen.getByText(/บัตรประชาชน/)).toBeTruthy()

    fireEvent.press(screen.getByText('ยืนยัน'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['DLTDrivingLicence', records.drivingLicence, 'dltt.png', 'กรมการขนส่งทางบก', 'ใบอนุญาตขับขี่', THEME.navy],
    ['ChulalongkornUniversityTranscript', records.transcript, 'chulalongkorn.png', 'จุฬาลงกรณ์มหาวิทยาลัย', 'ใบแสดงผลการเรียน', THEME.pink],
  ] as const)('renders the issuer card for %s', (_type, record, imageName, issuerLabel, documentLabel, accentColor) => {
    const onConfirm = jest.fn()
    const issuerSource = ReactNativeImage.resolveAssetSource(require(`../../assets/images/${imageName}`))

    render(<IssuanceTrustConfirmationPanel variant="issuer" record={record} onConfirm={onConfirm} />)

    expect(screen.getByTestId('trust-confirmation-content').props.className).toContain('items-center')
    expect(screen.getByTestId('trust-confirmation-card').props.className).toContain('max-w-[340px]')
    expect(StyleSheet.flatten(screen.getByTestId('trust-confirmation-card').props.style)).toEqual(
      expect.objectContaining({ borderColor: accentColor }),
    )
    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('issuer-confirmation-image').props.source)).toEqual(issuerSource)
    expect(screen.getByText(issuerLabel)).toBeTruthy()
    expect(screen.getByText(new RegExp(documentLabel))).toBeTruthy()
    expect(screen.getByTestId('issuer-confirmation-badge')).toBeTruthy()

    fireEvent.press(screen.getByText('ยืนยัน'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('uses a neutral image for an unsupported issuer type', () => {
    const record: VerifiableCredentialRecord = {
      id: 'medical-1',
      type: 'MedicalCertificate',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    }
    const profileSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/profile.png'))

    render(
      <IssuanceTrustConfirmationPanel
        variant="issuer"
        record={record}
        onConfirm={jest.fn()}
      />,
    )

    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('issuer-confirmation-image').props.source)).toEqual(profileSource)
    expect(screen.getByText(/Medical Certificate/)).toBeTruthy()
    expect(screen.queryByText('กรมการปกครอง')).toBeNull()
  })

  test('uses a neutral image when no issuer type is available', () => {
    const profileSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/profile.png'))

    render(
      <IssuanceTrustConfirmationPanel
        variant="issuer"
        onConfirm={jest.fn()}
      />,
    )

    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('issuer-confirmation-image').props.source)).toEqual(profileSource)
    expect(screen.queryByText('กรมการปกครอง')).toBeNull()
  })
})
