import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { DcApiPresentationFlow } from './DcApiPresentationFlow'
import { useDcApiPresentationStore } from '../store/dcApiPresentationStore'
import type { DcApiResolvedPresentation } from '../services/vp/dcApi/dcApiPresentationService'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: jest.fn(),
}))

jest.mock('../services/vp/dcApi/dcApiConsentBridge', () => ({
  resolveQueuedDcApiPresentation: jest.fn(),
}))

jest.mock('../services/vp/dcApi/nativeDcApiProviderModule', () => ({
  cancelDcApiSession: jest.fn(),
  completeDcApiSession: jest.fn(),
}))

jest.mock('../services/vp/dcApi/dcApiPresentationService', () => ({
  completeDcApiPresentation: jest.fn(),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../services/history/presentationHistory', () => ({
  recordSuccessfulPresentation: jest.fn(),
}))

jest.mock('./PresentationStepScaffold', () => {
  const { View } = require('react-native')
  return {
    PresentationStepScaffold: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

const { useStoredCredentials } = jest.requireMock('../hooks/useStoredCredentials') as {
  useStoredCredentials: jest.Mock
}

const credential: VerifiableCredentialRecord = {
  id: 'mdl-1',
  type: 'DLTDrivingLicence',
  rawVc: 'mdoc:abc',
  claims: { doctype: 'org.iso.18013.5.1.mDL', givenName: 'Ada', familyName: 'Lovelace' },
  issuedAt: '2026-08-26T00:00:00.000Z',
}

const resolved: DcApiResolvedPresentation = {
  sessionId: 'session-1',
  protocol: 'openid4vp-v1-unsigned',
  origin: 'https://digital-credentials.dev',
  responseMode: 'dc_api',
  authorizationRequest: {
    nonce: 'nonce-1',
    response_mode: 'dc_api',
    dcql_query: {
      credentials: [
        {
          id: 'mdl',
          format: 'mso_mdoc',
          meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
          claims: [
            { path: ['org.iso.18013.5.1', 'family_name'] },
            { path: ['org.iso.18013.5.1', 'given_name'] },
          ],
        },
      ],
    },
  },
  dcqlQuery: {
    credentials: [
      {
        id: 'mdl',
        format: 'mso_mdoc',
        meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
        claims: [
          { path: ['org.iso.18013.5.1', 'family_name'] },
          { path: ['org.iso.18013.5.1', 'given_name'] },
        ],
      },
    ],
  },
  selectedDcqlQueryId: 'mdl',
  matchedCredential: credential,
  nonce: 'nonce-1',
  requestedNamespaceKeys: [
    'org.iso.18013.5.1/family_name',
    'org.iso.18013.5.1/given_name',
  ],
}

describe('DcApiPresentationFlow', () => {
  const { resolveQueuedDcApiPresentation } = jest.requireMock(
    '../services/vp/dcApi/dcApiConsentBridge',
  ) as {
    resolveQueuedDcApiPresentation: jest.Mock
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resolveQueuedDcApiPresentation.mockResolvedValue(undefined)
    useDcApiPresentationStore.setState({
      phase: {
        tag: 'ready',
        sessionId: 'session-1',
        protocol: resolved.protocol,
        origin: resolved.origin,
        request: resolved.authorizationRequest,
        transport: 'same_device',
        resolved,
      },
      routeGeneration: 1,
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    })
    useStoredCredentials.mockReturnValue({ credentials: [credential], status: 'ready' })
  })

  test('does not reset to consent when stored credentials refresh after accept', async () => {
    const { rerender } = render(
      <DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />,
    )

    expect(screen.getByText('รับทราบและยินยอมส่งข้อมูล')).toBeTruthy()

    await act(async () => {
      fireEvent.press(screen.getByText('รับทราบและยินยอมส่งข้อมูล'))
    })

    expect(screen.getByText('ยอมรับ')).toBeTruthy()
    expect(screen.queryByText('รับทราบและยินยอมส่งข้อมูล')).toBeNull()

    useStoredCredentials.mockReturnValue({
      credentials: [{ ...credential, claims: { ...credential.claims, refreshed: true } }],
      status: 'ready',
    })

    rerender(<DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getByText('ยอมรับ')).toBeTruthy()
    expect(screen.queryByText('รับทราบและยินยอมส่งข้อมูล')).toBeNull()
  })

  test('restores the info step after a route remount once consent was accepted', async () => {
    useDcApiPresentationStore.setState({
      consentAcceptedSessionId: 'session-1',
      selectedClaimKeys: ['org.iso.18013.5.1/family_name', 'org.iso.18013.5.1/given_name'],
    })

    const { unmount } = render(
      <DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />,
    )

    expect(screen.getByText('ยอมรับ')).toBeTruthy()

    unmount()
    render(<DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getByText('ยอมรับ')).toBeTruthy()
    expect(screen.queryByText('รับทราบและยินยอมส่งข้อมูล')).toBeNull()
  })

  test('starts resolving when a second session is queued after the first finished', async () => {
    useDcApiPresentationStore.setState({
      phase: { tag: 'finished', sessionId: 'session-1' },
      routeGeneration: 2,
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    })

    const { rerender } = render(
      <DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />,
    )

    await act(async () => {
      useDcApiPresentationStore.getState().queueIncomingRequest({
        sessionId: 'session-2',
        protocol: 'openid4vp-v1-unsigned',
        origin: 'https://digital-credentials.dev',
        request: { nonce: 'nonce-2' },
        transport: 'same_device',
      })
    })

    rerender(<DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getByText('กำลังตรวจสอบคำขอจากผู้ตรวจสอบ...')).toBeTruthy()
    expect(resolveQueuedDcApiPresentation).toHaveBeenCalled()
  })

  test('shows consent when the same session is re-queued after success', async () => {
    useDcApiPresentationStore.setState({
      phase: {
        tag: 'ready',
        sessionId: 'session-1',
        protocol: resolved.protocol,
        origin: resolved.origin,
        request: resolved.authorizationRequest,
        transport: 'same_device',
        resolved,
      },
      routeGeneration: 2,
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    })

    const { rerender } = render(
      <DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />,
    )

    expect(screen.getByText('รับทราบและยินยอมส่งข้อมูล')).toBeTruthy()

    await act(async () => {
      useDcApiPresentationStore.getState().markFinished('session-1')
    })

    await act(async () => {
      useDcApiPresentationStore.getState().queueIncomingRequest({
        sessionId: 'session-1',
        protocol: resolved.protocol,
        origin: resolved.origin,
        request: resolved.authorizationRequest,
        transport: 'same_device',
      })
      useDcApiPresentationStore.getState().setResolvedPresentation(resolved)
    })

    rerender(<DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getByText('รับทราบและยินยอมส่งข้อมูล')).toBeTruthy()
  })

  test('does not retry resolve after a permanent failure', async () => {
    resolveQueuedDcApiPresentation.mockRejectedValueOnce(
      new Error('PresentationRequestInvalid: verifier is not trusted'),
    )

    useDcApiPresentationStore.setState({
      phase: {
        tag: 'pending',
        sessionId: 'session-fail',
        protocol: 'openid4vp-v1-signed',
        origin: 'https://digital-credentials.dev',
        request: { request: 'eyJhbGciOiJFUzI1NiJ9.eyJub25jZSI6IjEifQ.sig' },
        transport: 'same_device',
      },
      routeGeneration: 1,
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    })

    const { rerender } = render(
      <DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(resolveQueuedDcApiPresentation).toHaveBeenCalledTimes(1)

    useStoredCredentials.mockReturnValue({
      credentials: [{ ...credential, claims: { ...credential.claims, refreshed: true } }],
      status: 'ready',
    })

    rerender(<DcApiPresentationFlow onDone={jest.fn()} onCancel={jest.fn()} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(resolveQueuedDcApiPresentation).toHaveBeenCalledTimes(1)
  })
})
