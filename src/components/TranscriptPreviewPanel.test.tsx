import { fireEvent, render, screen } from '@testing-library/react-native'

import { TranscriptPreviewPanel } from './TranscriptPreviewPanel'

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

    render(<TranscriptPreviewPanel record={record} onAccept={onAccept} />)

    expect(screen.getByTestId('transcript-preview-panel').props.className).toContain('items-center')
    expect(screen.getByTestId('transcript-preview-content').props.className).toContain('max-w-[380px]')
    expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner')).toBeTruthy()
    expect(screen.getByTestId('document-card-hero')).toBeTruthy()
    expect(screen.getByTestId('document-card-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-card-divider')).toBeTruthy()
    expect(screen.getByTestId('document-card-right-column')).toBeTruthy()
    expect(screen.getByText('6304012022')).toBeTruthy()
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('3.75')).toBeTruthy()
    expect(screen.getByTestId('document-detail-card')).toBeTruthy()
    expect(screen.queryByTestId('document-detail-my-qr')).toBeNull()
    expect(screen.queryByTestId('document-detail-present-nfc')).toBeNull()

    fireEvent.press(screen.getByText('ยอมรับ'))

    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  test('fills missing Thai name from the holder profile and uses the mock English name', () => {
    render(
      <TranscriptPreviewPanel
        record={record}
        holderProfile={{
          thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
          englishName: 'Pitchaya Rungruangkit',
        }}
        onAccept={() => undefined}
      />,
    )

    expect(screen.getByText('นางสาว พิชญา รุ่งเรืองกิจ')).toBeTruthy()
    expect(screen.getByText('Ms. Thodsopp Eekkasandigital')).toBeTruthy()
    expect(screen.queryByText('Somchai Jaidee')).toBeNull()
    expect(screen.queryByText('วันเกิด / Date of Birth')).toBeNull()
  })

  test('hides transcript birth date even when the issuer provided one', () => {
    render(
      <TranscriptPreviewPanel
        record={{ ...record, claims: { ...record.claims, birthDate: '1980-01-01' } }}
        holderProfile={{ birthDate: '1990-05-15' }}
        onAccept={() => undefined}
      />,
    )

    expect(screen.queryByText('วันเกิด / Date of Birth')).toBeNull()
    expect(screen.queryByText('1 มกราคม 2523')).toBeNull()
  })
})
