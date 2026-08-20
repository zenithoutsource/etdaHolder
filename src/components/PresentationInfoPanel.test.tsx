import { render, screen } from '@testing-library/react-native'

import { PresentationInfoPanel } from './PresentationInfoPanel'
import type { ResolvedPresentationRequest } from '../services/vp/presentationService'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons')

jest.mock('../services/crypto/crypto', () => ({
  getWalletKeyRegisteredAt: () => '2026-01-01T00:00:00.000Z',
}))

const pidRecord: VerifiableCredentialRecord = {
  id: 'pid-1',
  type: 'ThaiNationalID',
  rawVc: 'header.payload.signature',
  claims: {
    thaiFullName: 'นางสาว พิชญา รุ่งเรืองกิจ',
    englishFullName: 'Pitchaya Rungruangkit',
    nationalId: '1-1009-000XX-XX-XX',
  },
  issuedAt: '2026-01-01T00:00:00.000Z',
}

const mockStoredCredentials: { current: VerifiableCredentialRecord[] } = {
  current: [pidRecord],
}

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({ credentials: mockStoredCredentials.current }),
}))

function requestFor(
  matchedCredential: VerifiableCredentialRecord,
): ResolvedPresentationRequest {
  return {
    requestUri: 'openid4vp://authorize',
    clientId: 'redirect_uri:https://verifier.example.com/cb',
    responseUri: 'https://verifier.example.com/cb',
    responseMode: 'direct_post',
    nonce: 'nonce-1',
    protocolPath: 'legacy',
    verifier: {
      clientId: 'redirect_uri:https://verifier.example.com/cb',
      name: 'Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    },
    matchedCredential,
    disclosures: [
      { key: 'full_name', label: 'ชื่อ-นามสกุล', value: 'นางสาว พิชญา รุ่งเรืองกิจ', mandatory: true, selective: false },
    ],
  }
}

describe('PresentationInfoPanel', () => {
  beforeEach(() => {
    mockStoredCredentials.current = [pidRecord]
  })

  test('renders the PID document card with Thai and English names', () => {
    render(
      <PresentationInfoPanel
        request={requestFor(pidRecord)}
        selectedClaimKeys={new Set(['full_name'])}
        onToggleClaim={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByTestId('document-detail-card')).toBeTruthy()
    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('Pitchaya Rungruangkit')
    expect(screen.queryByText('ศาสนา')).toBeNull()
  })

  test('maps issuer names and vehicle type B on the driving-licence card', () => {
    const licence: VerifiableCredentialRecord = {
      id: 'licence-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'สมชาย',
        familyName: 'ใจดี',
        licenceClass: 'B',
        licenceNumber: '54002891',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    render(
      <PresentationInfoPanel
        request={requestFor(licence)}
        selectedClaimKeys={new Set(['full_name'])}
        onToggleClaim={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByTestId('driving-licence-card')).toBeTruthy()
    expect(screen.getAllByText('สมชาย ใจดี').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ms. Thodsopp Eekkasandigital').length).toBeGreaterThan(0)
    expect(screen.getByText('รถยนต์ส่วนบุคคล')).toBeTruthy()
    expect(screen.getByText('Private Motor Car')).toBeTruthy()
    expect(screen.queryByText('B')).toBeNull()
  })

  test('fills missing transcript Thai name from PID and uses the mock English name', () => {
    const transcript: VerifiableCredentialRecord = {
      id: 'transcript-1',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'Somchai',
        familyName: 'Jaidee',
        studentId: '6304012022',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    render(
      <PresentationInfoPanel
        request={requestFor(transcript)}
        selectedClaimKeys={new Set(['full_name'])}
        onToggleClaim={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByTestId('document-detail-card')).toBeTruthy()
    expect(screen.getByTestId('document-detail-name')).toHaveTextContent('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(screen.getByTestId('document-detail-name-en')).toHaveTextContent('Ms. Thodsopp Eekkasandigital')
    expect(screen.queryByText('วันเกิด / Date of Birth')).toBeNull()
  })

  test('keeps issuer driving-licence requested-item values when present', () => {
    const licence: VerifiableCredentialRecord = {
      id: 'licence-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'สมชาย',
        familyName: 'ใจดี',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    render(
      <PresentationInfoPanel
        request={{
          ...requestFor(licence),
          disclosures: [
            { key: 'given_name', label: 'ชื่อ', value: 'สมชาย', mandatory: true, selective: false },
            { key: 'family_name', label: 'นามสกุล', value: 'ใจดี', mandatory: true, selective: false },
          ],
        }}
        selectedClaimKeys={new Set(['given_name', 'family_name'])}
        onToggleClaim={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByText('สมชาย')).toBeTruthy()
    expect(screen.getByText('ใจดี')).toBeTruthy()
    expect(screen.queryByText('นางสาว พิชญา')).toBeNull()
    expect(screen.queryByText('รุ่งเรืองกิจ')).toBeNull()
  })

  test('hides religion on requested items even when the verifier asked for it', () => {
    render(
      <PresentationInfoPanel
        request={{
          ...requestFor(pidRecord),
          disclosures: [
            { key: 'national_id', label: 'ID', value: '123', mandatory: true, selective: false },
            { key: 'religion', label: 'Religion', value: 'Buddhist', mandatory: false, selective: true },
          ],
        }}
        selectedClaimKeys={new Set(['national_id', 'religion'])}
        onToggleClaim={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getAllByText('เลขบัตรประจำตัวประชาชน').length).toBeGreaterThan(0)
    expect(screen.queryByText('ศาสนา')).toBeNull()
    expect(screen.queryByText('Buddhist')).toBeNull()
  })

  test('shows driving-licence given name above family name on requested items', () => {
    const licence: VerifiableCredentialRecord = {
      id: 'licence-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'สมชาย',
        familyName: 'ใจดี',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    render(
      <PresentationInfoPanel
        request={{
          ...requestFor(licence),
          disclosures: [
            { key: 'family_name', label: 'นามสกุล', value: 'ใจดี', mandatory: true, selective: false },
            { key: 'given_name', label: 'ชื่อ', value: 'สมชาย', mandatory: true, selective: false },
          ],
        }}
        selectedClaimKeys={new Set(['family_name', 'given_name'])}
        onToggleClaim={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByText('ชื่อ')).toBeTruthy()
    expect(screen.getByText('นามสกุล')).toBeTruthy()
    const json = JSON.stringify(screen.toJSON())
    expect(json.indexOf('"ชื่อ"')).toBeLessThan(json.indexOf('"นามสกุล"'))
  })
})
