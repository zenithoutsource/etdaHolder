import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import ScanScreen from '../../app/(tabs)/scan'
import { useDeeplinkStore } from '../store/deeplinkStore'

const mockReact = React
const mockText = Text
const mockRouterReplace = jest.fn()
const mockRouterPush = jest.fn()
const mockRouter = {
  replace: mockRouterReplace,
  push: mockRouterPush,
}

jest.mock('expo-camera', () => ({
  CameraView: jest.fn(() => null),
  useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
}))

jest.mock('expo-router', () => {
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockReact.useEffect(() => effect(), [effect])
    },
  }
})

jest.mock('../components/WalletHeader', () => ({
  WalletHeader: () => mockReact.createElement(mockText, null, 'Scan Header'),
}))

jest.mock('../hooks/useScreenCaptureGuard', () => ({
  useScreenCaptureGuard: jest.fn(),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

const cameraMock = jest.requireMock('expo-camera') as {
  CameraView: jest.Mock
  useCameraPermissions: jest.Mock
}

jest.mock('../services/vp/presentationService', () => ({
  isOid4VpAuthorizationRequest: jest.fn((uri: string) => uri.startsWith('openid4vp://')),
}))

describe('ScanScreen deeplink handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRouterReplace.mockClear()
    mockRouterPush.mockClear()
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
  })

  it('stores pending credential offer URI without navigating from Scan', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ftranscript-offer'

    render(<ScanScreen />)

    await act(async () => {
      cameraMock.CameraView.mock.calls.at(-1)?.[0].onBarcodeScanned({ data: offerUri })
    })

    expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(screen.queryByText('Scan Success')).toBeNull()
  })

  it('hands off scanned OID4VP QR to presentation-request route', async () => {
    const requestUri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'

    render(<ScanScreen />)

    await act(async () => {
      cameraMock.CameraView.mock.calls.at(-1)?.[0].onBarcodeScanned({ data: requestUri })
    })

    expect(useDeeplinkStore.getState().pendingUri).toBe(requestUri)
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/presentation-request')
  })
})
