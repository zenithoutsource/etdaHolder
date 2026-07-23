import { fireEvent, render, screen } from '@testing-library/react-native'
import { useState } from 'react'

import {
  PresentationConsentPanel,
  isToggleablePresentationDisclosure,
  readInitialSelectedClaimKeys,
} from './PresentationConsentPanel'
import type { ResolvedPresentationRequest } from '../services/vp/presentationService'

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

  test('disables accept when no claims will be disclosed', () => {
    const selectiveOnlyRequest: ResolvedPresentationRequest = {
      ...request,
      disclosures: [{ key: 'religion', label: 'Religion', value: 'Buddhist', mandatory: false, selective: true }],
    }

    render(
      <PresentationConsentPanel
        request={selectiveOnlyRequest}
        selectedClaimKeys={new Set()}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />,
    )

    expect(screen.getByText('รับทราบและยินยอมส่งข้อมูล')).toBeDisabled()
  })

  test('calls onToggleClaim for selective rows', () => {
    const onToggleClaim = jest.fn()
    render(
      <PresentationConsentPanel
        request={request}
        selectedClaimKeys={new Set(['religion'])}
        onToggleClaim={onToggleClaim}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />,
    )

    fireEvent.press(screen.getByRole('checkbox'))
    expect(onToggleClaim).toHaveBeenCalledWith('religion')
  })

  test('does not call onToggleClaim for mandatory rows', () => {
    const onToggleClaim = jest.fn()
    render(
      <PresentationConsentPanel
        request={request}
        selectedClaimKeys={new Set(['religion'])}
        onToggleClaim={onToggleClaim}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />,
    )

    fireEvent.press(screen.getByText('เลขบัตรประจำตัวประชาชน'))
    expect(onToggleClaim).not.toHaveBeenCalled()
  })

  test('unchecks selective rows when holder toggles them off', () => {
    function ToggleHarness() {
      const [selectedClaimKeys, setSelectedClaimKeys] = useState(
        () => new Set(['religion']),
      )

      return (
        <PresentationConsentPanel
          request={request}
          selectedClaimKeys={selectedClaimKeys}
          onToggleClaim={(claimKey) => {
            setSelectedClaimKeys((previous) => {
              const next = new Set(previous)
              if (next.has(claimKey)) next.delete(claimKey)
              else next.add(claimKey)
              return next
            })
          }}
          onAccept={jest.fn()}
          onReject={jest.fn()}
        />
      )
    }

    render(<ToggleHarness />)

    expect(screen.getByRole('checkbox')).toHaveAccessibilityState({ checked: true })
    fireEvent.press(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toHaveAccessibilityState({ checked: false })
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
