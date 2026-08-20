import { fireEvent, render, screen } from '@testing-library/react-native'

import {
  PresentationConsentPanel,
  isToggleablePresentationDisclosure,
  readConsentItems,
  readInitialSelectedClaimKeys,
} from './PresentationConsentPanel'
import type { ResolvedPresentationRequest } from '../services/vp/presentationService'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({ credentials: mockStoredCredentials.current }),
}))

const mockStoredCredentials: { current: ResolvedPresentationRequest['matchedCredential'][] } = {
  current: [],
}

const request: ResolvedPresentationRequest = {
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
  matchedCredential: {
    id: 'cred-1',
    type: 'ThaiNationalID',
    rawVc: 'issuer.jwt~',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
  },
  disclosures: [
    { key: 'national_id', label: 'ID', value: '123', mandatory: true, selective: false },
    { key: 'religion', label: 'Religion', value: 'Buddhist', mandatory: false, selective: true },
  ],
}

describe('PresentationConsentPanel', () => {
  beforeEach(() => {
    mockStoredCredentials.current = []
  })

  test('readInitialSelectedClaimKeys pre-selects locked and toggleable disclosure keys', () => {
    expect(readInitialSelectedClaimKeys(request.disclosures)).toEqual(new Set(['national_id', 'religion']))
  })

  test('renders consent title from credential-type mock when verifier name is missing', () => {
    render(
      <PresentationConsentPanel request={request} onAccept={jest.fn()} onReject={jest.fn()} />,
    )

    expect(screen.getByText('ข้อมูลที่ร้านบาร์ต้องการ')).toBeTruthy()
    expect(screen.queryByTestId('presentation-consent-verifier-logo')).toBeNull()
  })

  test('uses a company icon instead of a Chula PNG on transcript consent', () => {
    render(
      <PresentationConsentPanel
        request={{
          ...request,
          matchedCredential: {
            ...request.matchedCredential,
            type: 'ChulalongkornUniversityTranscript',
          },
        }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />,
    )

    expect(screen.queryByTestId('presentation-consent-verifier-logo')).toBeNull()
    expect(screen.getByText('ข้อมูลที่บริษัทต้องการ')).toBeTruthy()
  })

  test('hides religion on consent while still pre-selecting it for VP submit', () => {
    expect(readInitialSelectedClaimKeys(request.disclosures)).toEqual(new Set(['national_id', 'religion']))

    render(
      <PresentationConsentPanel request={request} onAccept={jest.fn()} onReject={jest.fn()} />,
    )

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('เลขบัตรประจำตัวประชาชน')).toBeTruthy()
    expect(screen.queryByText('ศาสนา')).toBeNull()
    expect(screen.queryByText('Buddhist')).toBeNull()
    expect(screen.queryByText('Religion')).toBeNull()
  })

  test('shows driving-licence given name above family name on consent', () => {
    const disclosures = [
      { key: 'family_name', label: 'นามสกุล', value: 'ใจดี', mandatory: true, selective: false },
      { key: 'given_name', label: 'ชื่อ', value: 'สมชาย', mandatory: true, selective: false },
    ]
    expect(readConsentItems(disclosures, new Set(['family_name', 'given_name']), 'DLTDrivingLicence').map((item) => item.label)).toEqual([
      'ชื่อ',
      'นามสกุล',
    ])

    render(
      <PresentationConsentPanel
        request={{
          ...request,
          matchedCredential: {
            id: 'licence-1',
            type: 'DLTDrivingLicence',
            rawVc: 'dl.jwt~',
            claims: { givenName: 'สมชาย', familyName: 'ใจดี' },
            issuedAt: '2026-01-01T00:00:00.000Z',
          },
          disclosures,
        }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />,
    )

    expect(screen.getByText('ชื่อ')).toBeTruthy()
    expect(screen.getByText('นามสกุล')).toBeTruthy()
    const json = JSON.stringify(screen.toJSON())
    expect(json.indexOf('"ชื่อ"')).toBeLessThan(json.indexOf('"นามสกุล"'))
  })


  test('primary button calls onAccept without requiring claim selection state', () => {
    const onAccept = jest.fn()
    render(
      <PresentationConsentPanel request={request} onAccept={onAccept} onReject={jest.fn()} />,
    )

    fireEvent.press(screen.getByText('รับทราบและยินยอมส่งข้อมูล'))
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  test('calls onReject when holder declines', () => {
    const onReject = jest.fn()
    render(
      <PresentationConsentPanel request={request} onAccept={jest.fn()} onReject={onReject} />,
    )

    fireEvent.press(screen.getByText('ไม่ยินยอม'))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  test('isToggleablePresentationDisclosure ignores truthy mandatory-like values', () => {
    expect(
      isToggleablePresentationDisclosure({
        key: 'religion',
        label: 'Religion',
        value: 'Buddhist',
        mandatory: 'false' as unknown as boolean,
        selective: true,
      }),
    ).toBe(true)
  })

  test('keeps issuer driving-licence name disclosure values when present', () => {
    mockStoredCredentials.current = [
      {
        id: 'pid-1',
        type: 'ThaiNationalID',
        rawVc: 'pid.jwt~',
        claims: {
          thaiFullName: 'นางสาว พิชญา รุ่งเรืองกิจ',
          englishFullName: 'Pitchaya Rungruangkit',
        },
        issuedAt: '2026-01-01T00:00:00.000Z',
      },
    ]

    render(
      <PresentationConsentPanel
        request={{
          ...request,
          matchedCredential: {
            id: 'licence-1',
            type: 'DLTDrivingLicence',
            rawVc: 'dl.jwt~',
            claims: { givenName: 'สมชาย', familyName: 'ใจดี' },
            issuedAt: '2026-01-01T00:00:00.000Z',
          },
          disclosures: [
            { key: 'given_name', label: 'ชื่อ', value: 'สมชาย', mandatory: true, selective: false },
            { key: 'family_name', label: 'นามสกุล', value: 'ใจดี', mandatory: true, selective: false },
          ],
        }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />,
    )

    expect(screen.getByText('สมชาย')).toBeTruthy()
    expect(screen.getByText('ใจดี')).toBeTruthy()
    expect(screen.queryByText('นางสาว พิชญา')).toBeNull()
    expect(screen.queryByText('รุ่งเรืองกิจ')).toBeNull()
  })
})
