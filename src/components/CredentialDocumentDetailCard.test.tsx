import { render, screen } from '@testing-library/react-native'
import { Image, StyleSheet } from 'react-native'

import { CredentialDocumentDetailCard } from './CredentialDocumentDetailCard'
import type { CredentialDetailDisplay } from '../services/credentials/credentialDisplay'

const ReactNativeImage = Image as unknown as {
  resolveAssetSource: (source: unknown) => unknown
}

const display: CredentialDetailDisplay = {
  title: 'Thai National ID',
  documentTitle: 'ID CARD',
  issuerName: 'Department of Provincial Administration',
  primaryColor: '#002887',
  imageKey: 'id',
  primaryText: 'Pitchaya Rungruangkit',
  rows: [],
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
  test('renders the ETDA Wallet document detail structure from the HTML reference', () => {
    render(<CredentialDocumentDetailCard display={display} onOpenQr={() => undefined} />)

    expect(screen.getByTestId('document-detail-card')).toBeTruthy()
    expect(screen.getByTestId('document-detail-band')).toHaveTextContent('ID CARD')
    expect(screen.getByTestId('document-detail-hero')).toBeTruthy()
    expect(screen.getByTestId('document-detail-photo')).toBeTruthy()
    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('Pitchaya Rungruangkit')
    expect(screen.getByTestId('document-detail-primary-id')).toHaveTextContent('1-1009-000XX-XX-XX')
    expect(screen.getByTestId('document-detail-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-detail-right-column')).toBeTruthy()
    expect(screen.getByTestId('document-detail-my-qr')).toHaveTextContent('My QR')
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

    expect(screen.getByTestId('document-detail-image').props.resizeMode).toBe('cover')
    expect(StyleSheet.flatten(screen.getByTestId('document-detail-image').props.style)).toEqual(
      expect.objectContaining({
        height: '100%',
        width: '100%',
      })
    )
    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('document-detail-image').props.source)).toEqual(
      userProfileSource
    )
  })

  test('sizes the blue card header as a full-width unclipped band', () => {
    render(
      <CredentialDocumentDetailCard
        display={{
          ...display,
          title: 'Academic Transcript',
          documentTitle: 'TRANSCRIPT',
          imageKey: 'transcript',
          primaryColor: '#123b8c',
        }}
        onOpenQr={() => undefined}
      />
    )

    expect(StyleSheet.flatten(screen.getByTestId('document-detail-band-wrap').props.style)).toEqual(
      expect.objectContaining({
        alignSelf: 'stretch',
        backgroundColor: '#123b8c',
        minHeight: 48,
        overflow: 'hidden',
        width: '100%',
      })
    )
    expect(screen.getByTestId('document-detail-band').props.style).toEqual(
      expect.objectContaining({
        lineHeight: 24,
      })
    )
  })
})
