import { fireEvent, render, screen } from '@testing-library/react-native'

import {
  PresentationConsentPanel,
  isToggleablePresentationDisclosure,
  readInitialSelectedClaimKeys,
} from './PresentationConsentPanel'
import type { ResolvedPresentationRequest } from '../services/vp/presentationService'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

const request: ResolvedPresentationRequest = {
  requestUri: 'openid4vp://authorize',
  clientId: 'redirect_uri:https://verifier.example.com/cb',
  responseUri: 'https://verifier.example.com/cb',
  responseMode: 'direct_post',
  nonce: 'nonce-1',
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
  test('readInitialSelectedClaimKeys pre-selects locked and toggleable disclosure keys', () => {
    expect(readInitialSelectedClaimKeys(request.disclosures)).toEqual(new Set(['national_id', 'religion']))
  })

  test('renders all disclosure rows as locked consent items', () => {
    render(
      <PresentationConsentPanel request={request} onAccept={jest.fn()} onReject={jest.fn()} />,
    )

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('เลขบัตรประจำตัวประชาชน')).toBeTruthy()
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
})
