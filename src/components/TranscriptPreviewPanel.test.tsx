import { fireEvent, render, screen } from '@testing-library/react-native'

import { TranscriptPreviewPanel } from './TranscriptPreviewPanel'
import * as credentialDisplay from '../services/credentials/credentialDisplay'

const record = {
  id: 'transcript-preview',
  type: 'ChulalongkornUniversityTranscript',
  rawVc: 'vc',
  issuedAt: '2026-07-17T00:00:00.000Z',
  expiresAt: '2030-11-28T00:00:00.000Z',
  claims: {
    givenName: 'Somchai',
    familyName: 'Jaidee',
    studentId: '6304012022',
    faculty: 'Engineering',
    degree: 'Computer Engineering',
    gpa: '3.75',
    graduationYear: '2025',
  },
}

describe('TranscriptPreviewPanel', () => {
  test('renders dynamic claims in the shared card and accepts the credential', () => {
    const onAccept = jest.fn()

    render(<TranscriptPreviewPanel record={record} profileImage={require('../../assets/images/user_profile.png')} onAccept={onAccept} />)

    expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner')).toBeTruthy()
    expect(screen.getByTestId('document-card-hero')).toBeTruthy()
    expect(screen.getByTestId('document-card-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-card-divider')).toBeTruthy()
    expect(screen.getByTestId('document-card-right-column')).toBeTruthy()
    expect(screen.getByText('6304012022')).toBeTruthy()
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('3.75')).toBeTruthy()

    fireEvent.press(screen.getByText('ยอมรับ'))

    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  test('uses the preview birth-date row when the holder profile has none', () => {
    const profileSpy = jest.spyOn(credentialDisplay, 'readCredentialHolderProfile').mockReturnValue({})

    render(
      <TranscriptPreviewPanel
        record={{ ...record, claims: { ...record.claims, birthDate: '1990-05-15' } }}
        profileImage={require('../../assets/images/user_profile.png')}
        onAccept={() => undefined}
      />,
    )

    expect(screen.getByText('1990-05-15')).toBeTruthy()
    profileSpy.mockRestore()
  })
})
