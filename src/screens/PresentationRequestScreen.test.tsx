import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Text, Pressable } from 'react-native'

import PresentationRequestRoute from '../../app/(tabs)/presentation-request'
import { useDeeplinkStore } from '../store/deeplinkStore'

const mockReact = React
const mockText = Text
const mockPressable = Pressable
const mockRouterReplace = jest.fn()
const mockRouterDismissTo = jest.fn()
const mockRouterPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    dismissTo: mockRouterDismissTo,
    push: mockRouterPush,
    canGoBack: () => false,
    back: jest.fn(),
  }),
  useNavigation: () => ({
    getParent: () => null,
  }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react')
    useEffect(() => callback(), [callback])
  },
}))

jest.mock('expo-linking', () => ({
  useURL: jest.fn(() => null),
  getInitialURL: jest.fn(async () => null),
}))

jest.mock('../hooks/useScreenCaptureGuard', () => ({
  useScreenCaptureGuard: jest.fn(),
}))

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({ credentials: [] }),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('../services/vp/presentationRequestReplay', () => ({
  isPresentationRequestConsumed: jest.fn(() => false),
}))

jest.mock('../services/credentials/resumeSameDeviceClaim', () => ({
  resumeSameDeviceClaimFromSession: jest.fn(async () => ({ status: 'no_session' })),
  resumeSameDeviceClaimAfterPidVp: jest.fn(async () => ({ status: 'no_session' })),
}))

jest.mock('../components/Oid4VpDisclosureFlow', () => ({
  Oid4VpDisclosureFlow: ({
    authorizationRequestUri,
    onDone,
    onCancel,
    onSucceeded,
  }: {
    authorizationRequestUri: string
    onDone: () => void
    onCancel: () => void
    onSucceeded?: () => void
  }) => {
    if (/[?&]state=expired(?:&|$)/.test(authorizationRequestUri)) {
      return mockReact.createElement(
        mockReact.Fragment,
        null,
        mockReact.createElement(mockText, null, 'คำขอนี้หมดอายุแล้ว'),
        mockReact.createElement(
          mockPressable,
          { accessibilityRole: 'button', onPress: onCancel },
          mockReact.createElement(mockText, null, 'กลับหน้าหลัก'),
        ),
      )
    }
    return mockReact.createElement(
      mockReact.Fragment,
      null,
      mockReact.createElement(mockText, null, `flow:${authorizationRequestUri}`),
      mockReact.createElement(
        mockPressable,
        { accessibilityRole: 'button', onPress: () => onSucceeded?.() },
        mockReact.createElement(mockText, null, 'mark-success'),
      ),
      mockReact.createElement(
        mockPressable,
        { accessibilityRole: 'button', onPress: onDone },
        mockReact.createElement(mockText, null, 'done'),
      ),
      mockReact.createElement(
        mockPressable,
        { accessibilityRole: 'button', onPress: onCancel },
        mockReact.createElement(mockText, null, 'cancel'),
      ),
      mockReact.createElement(
        mockPressable,
        { accessibilityRole: 'button', onPress: onCancel },
        mockReact.createElement(mockText, null, 'header-back'),
      ),
    )
  },
}))

import { isPresentationRequestConsumed } from '../services/vp/presentationRequestReplay'
import { resumeSameDeviceClaimAfterPidVp } from '../services/credentials/resumeSameDeviceClaim'
import { useSameDeviceIssuanceStore } from '../store/sameDeviceIssuanceStore'

const isPresentationRequestConsumedMock = isPresentationRequestConsumed as jest.MockedFunction<
  typeof isPresentationRequestConsumed
>
const mockResumeSameDeviceClaimAfterPidVp = resumeSameDeviceClaimAfterPidVp as jest.MockedFunction<
  typeof resumeSameDeviceClaimAfterPidVp
>

describe('PresentationRequestScreen deeplink remount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isPresentationRequestConsumedMock.mockReturnValue(false)
    mockResumeSameDeviceClaimAfterPidVp.mockResolvedValue({ status: 'no_session' })
    useSameDeviceIssuanceStore.getState().clearSession()
    useDeeplinkStore.setState({
      pendingUri: null,
      pendingPresentationFlowOrigin: null,
      activeUri: null,
      activePresentationFlowOrigin: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
      routeEpoch: 0,
      presentationIntakeError: null,
    })
  })

  it('reopens presentation flow after dismiss when a warm incoming VP event bumps vpGeneration', async () => {
    const firstUri = 'openid4vp://?response_type=vp_token&state=first'
    const secondUri = 'openid4vp://?response_type=vp_token&state=second'

    useDeeplinkStore.getState().setPendingDeeplinkUri(firstUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${firstUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('done'))

    expect(useDeeplinkStore.getState().dismissedUri).toBe(firstUri)
    expect(screen.queryByText(`flow:${firstUri}`)).toBeNull()

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(secondUri)
    })

    await waitFor(() => {
      expect(screen.getByText(`flow:${secondUri}`)).toBeTruthy()
    })
    expect(useDeeplinkStore.getState().vpGeneration).toBe(2)
  })

  it('reopens the same dismissed VP URI only after Scan clears dismiss then queues', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=same'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('done'))

    await act(async () => {
      // Linking redelivery must not reopen
      useDeeplinkStore.getState().setIncomingDeeplinkUri(requestUri)
    })
    expect(screen.queryByText(`flow:${requestUri}`)).toBeNull()
    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)

    await act(async () => {
      useDeeplinkStore.getState().clearDismissedDeeplinkUri()
      useDeeplinkStore.getState().setPendingPresentationRequest({ uri: requestUri, origin: 'scan' })
    })

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })
    expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    expect(useDeeplinkStore.getState().vpGeneration).toBe(2)
  })

  it('keeps expired failure UI in place until Back, then replace Wallet home without intake modal', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=expired'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText('คำขอนี้หมดอายุแล้ว')).toBeTruthy()
    })
    expect(useDeeplinkStore.getState().presentationIntakeError).toBeNull()
    expect(mockRouterReplace).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('กลับหน้าหลัก'))

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)')
    })
    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)
    expect(useDeeplinkStore.getState().presentationIntakeError).toBeNull()
  })

  it('silently ignores store redelivery of a dismissed expired VP URI', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=redeliver-after-dismiss'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    const { unmount } = render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('cancel'))
    unmount()

    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(requestUri)
    })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()

    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
    expect(screen.queryByText(`flow:${requestUri}`)).toBeNull()
    expect(useDeeplinkStore.getState().presentationIntakeError).toBeNull()
  })

  it('switches to a newer pending VP while an expired failure screen is still open', async () => {
    const expiredUri = 'openid4vp://?response_type=vp_token&state=expired'
    const nextUri = 'openid4vp://?response_type=vp_token&state=fresh-after-expired'

    useDeeplinkStore.getState().setPendingDeeplinkUri(expiredUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText('คำขอนี้หมดอายุแล้ว')).toBeTruthy()
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(nextUri)
    })

    await waitFor(() => {
      expect(screen.getByText(`flow:${nextUri}`)).toBeTruthy()
    })
    expect(screen.queryByText('คำขอนี้หมดอายุแล้ว')).toBeNull()
  })

  it('restores the flow from activeUri after pending was consumed on remount', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=active'

    useDeeplinkStore.getState().setPendingPresentationRequest({ uri: requestUri, origin: 'same-device' })
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe(requestUri)
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(useDeeplinkStore.getState().activeUri).toBe(requestUri)

    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })
  })

  it('switches to a newer pending VP while the previous active request is still open', async () => {
    const firstUri = 'openid4vp://?response_type=vp_token&state=first-open'
    const secondUri = 'openid4vp://?response_type=vp_token&state=second-open'

    useDeeplinkStore.getState().setPendingDeeplinkUri(firstUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${firstUri}`)).toBeTruthy()
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(secondUri)
    })

    await waitFor(() => {
      expect(screen.getByText(`flow:${secondUri}`)).toBeTruthy()
    })
    expect(screen.queryByText(`flow:${firstUri}`)).toBeNull()
    expect(useDeeplinkStore.getState().vpGeneration).toBe(2)
  })

  it('does not stick on the loading spinner after cancel when a newer VP was queued during the prior flow', async () => {
    const firstUri = 'openid4vp://?response_type=vp_token&state=fail-first'
    const secondUri = 'openid4vp://?response_type=vp_token&state=fail-second'

    useDeeplinkStore.getState().setPendingDeeplinkUri(firstUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${firstUri}`)).toBeTruthy()
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(secondUri)
    })

    await waitFor(() => {
      expect(screen.getByText(`flow:${secondUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('cancel'))

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
    expect(screen.queryByText(`flow:${secondUri}`)).toBeNull()
  })

  it('does not stick on the loading spinner after cancel when Linking still exposes the dismissed VP URI', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=expired-back'
    const linking = jest.requireMock('expo-linking') as {
      getInitialURL: jest.Mock
      useURL: jest.Mock
    }
    linking.useURL.mockReturnValue(requestUri)
    linking.getInitialURL.mockResolvedValue(requestUri)

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('cancel'))

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(useDeeplinkStore.getState().activeUri).toBeNull()
    expect(mockRouterReplace).toHaveBeenCalled()
  })

  it('does not show the loading spinner when remounted after dismiss while Linking still has the VP URI', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=expired-remount'
    const linking = jest.requireMock('expo-linking') as {
      getInitialURL: jest.Mock
      useURL: jest.Mock
    }
    linking.useURL.mockReturnValue(requestUri)
    linking.getInitialURL.mockResolvedValue(requestUri)

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    const { unmount } = render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('cancel'))
    unmount()

    // Simulate Android redelivery attempting to reopen via store (layout should
    // block this; if a remount happens anyway, UI must not spin).
    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
    expect(screen.queryByText(`flow:${requestUri}`)).toBeNull()
  })

  it('does not show the loading spinner after the flow exits', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=exit'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('done'))

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
  })

  it('returns to wallet when a consumed pending presentation request is queued', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=consumed'
    isPresentationRequestConsumedMock.mockReturnValue(true)

    useDeeplinkStore.getState().setPendingPresentationRequest({ uri: requestUri, origin: 'scan' })
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
    expect(useDeeplinkStore.getState().presentationIntakeError).toContain('ถูกดำเนินการแล้ว')
    expect(mockRouterReplace).toHaveBeenCalled()
  })

  it('does not stay on the loading spinner when getInitialURL returns a consumed VP URI', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=initial-consumed'
    const linking = jest.requireMock('expo-linking') as {
      getInitialURL: jest.Mock
      useURL: jest.Mock
    }
    linking.useURL.mockReturnValue(null)
    linking.getInitialURL.mockResolvedValue(requestUri)
    isPresentationRequestConsumedMock.mockReturnValue(true)

    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.queryByText('กำลังเปิดคำขอตรวจสอบ…')).toBeNull()
    })
    expect(mockRouterReplace).toHaveBeenCalled()
  })

  it('consumes the VP URI on presentation success so remount cannot reopen the request', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=success-consume'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('mark-success'))

    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)
    expect(useDeeplinkStore.getState().activeUri).toBeNull()
    expect(mockRouterReplace).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('header Back after presentation success returns to Wallet and does not open DOPA claim', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=success-header-back'
    useSameDeviceIssuanceStore.getState().setSession({
      id: 'session-1',
      credentialType: 'DLTDrivingLicence',
      phase: 'awaiting_pid_vp',
      codeVerifier: 'verifier',
      redirectUri: 'walletapp://callback',
    })
    mockResumeSameDeviceClaimAfterPidVp.mockResolvedValue({
      status: 'claim_ready',
      resolvedOffer: {
        credentialConfigurations: [{ id: 'DLTDrivingLicence', format: 'dc+sd-jwt', rawConfiguration: {} }],
        issuer: 'https://issuer.example',
        txCode: undefined,
      },
      authorizationCodeExchange: {
        authorizationCode: 'code',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        clientId: 'client',
        tokenEndpoint: 'https://issuer.example/token',
      },
    })

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('mark-success'))
    fireEvent.press(screen.getByText('header-back'))

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)')
    })
    expect(mockRouterPush).not.toHaveBeenCalledWith('/(tabs)/credential-offer')
    expect(mockResumeSameDeviceClaimAfterPidVp).not.toHaveBeenCalled()
  })

  it('Done after issuer PID presentation resumes the in-progress claim', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=success-done-resume'
    useSameDeviceIssuanceStore.getState().setSession({
      id: 'session-1',
      credentialType: 'DLTDrivingLicence',
      phase: 'awaiting_pid_vp',
      codeVerifier: 'verifier',
      redirectUri: 'walletapp://callback',
    })
    mockResumeSameDeviceClaimAfterPidVp.mockResolvedValue({
      status: 'claim_ready',
      resolvedOffer: {
        credentialConfigurations: [{ id: 'DLTDrivingLicence', format: 'dc+sd-jwt', rawConfiguration: {} }],
        issuer: 'https://issuer.example',
        txCode: undefined,
      },
      authorizationCodeExchange: {
        authorizationCode: 'code',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        clientId: 'client',
        tokenEndpoint: 'https://issuer.example/token',
      },
    })

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('done'))

    await waitFor(() => {
      expect(mockResumeSameDeviceClaimAfterPidVp).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/credential-offer')
    })
  })
})
