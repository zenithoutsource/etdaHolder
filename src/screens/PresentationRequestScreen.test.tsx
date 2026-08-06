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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    dismissTo: mockRouterDismissTo,
    push: jest.fn(),
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

jest.mock('../components/Oid4VpDisclosureFlow', () => ({
  Oid4VpDisclosureFlow: ({
    authorizationRequestUri,
    onDone,
  }: {
    authorizationRequestUri: string
    onDone: () => void
  }) =>
    mockReact.createElement(
      mockReact.Fragment,
      null,
      mockReact.createElement(mockText, null, `flow:${authorizationRequestUri}`),
      mockReact.createElement(
        mockPressable,
        { accessibilityRole: 'button', onPress: onDone },
        mockReact.createElement(mockText, null, 'done'),
      ),
    ),
}))

import { isPresentationRequestConsumed } from '../services/vp/presentationRequestReplay'

const isPresentationRequestConsumedMock = isPresentationRequestConsumed as jest.MockedFunction<
  typeof isPresentationRequestConsumed
>

describe('PresentationRequestScreen deeplink remount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isPresentationRequestConsumedMock.mockReturnValue(false)
    useDeeplinkStore.setState({
      pendingUri: null,
      pendingPresentationFlowOrigin: null,
      activeUri: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
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

  it('reopens the same dismissed VP URI when a fresh incoming event clears dismissal', async () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=same'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    render(<PresentationRequestRoute />)

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })

    fireEvent.press(screen.getByText('done'))

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(requestUri)
    })

    await waitFor(() => {
      expect(screen.getByText(`flow:${requestUri}`)).toBeTruthy()
    })
    expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    expect(useDeeplinkStore.getState().vpGeneration).toBe(2)
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
    expect(mockRouterDismissTo).toHaveBeenCalled()
  })
})
