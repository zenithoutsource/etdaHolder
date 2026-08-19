import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import ScanScreen from '../../app/(tabs)/scan'
import { isPresentationRequestConsumed } from '../services/vp/presentationRequestReplay'
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

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

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

jest.mock('../services/vp/presentationRequestReplay', () => ({
  isPresentationRequestConsumed: jest.fn(() => false),
}))

const isPresentationRequestConsumedMock = isPresentationRequestConsumed as jest.MockedFunction<
  typeof isPresentationRequestConsumed
>

describe('ScanScreen deeplink handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isPresentationRequestConsumedMock.mockReturnValue(false)
    mockRouterReplace.mockClear()
    mockRouterPush.mockClear()
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])
    useDeeplinkStore.setState({
      pendingUri: null,
      pendingPresentationFlowOrigin: null,
      pendingOfferFlowOrigin: null,
      activeUri: null,
      activePresentationFlowOrigin: null,
      activeOfferFlowOrigin: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
      presentationIntakeError: null,
    })
  })

  it('stores scan origin and navigates to credential-offer when an offer QR is scanned', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ftranscript-offer'

    render(<ScanScreen />)

    await act(async () => {
      cameraMock.CameraView.mock.calls.at(-1)?.[0].onBarcodeScanned({ data: offerUri })
    })

    expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
    expect(useDeeplinkStore.getState().pendingOfferFlowOrigin).toBe('scan')
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/credential-offer')
    expect(screen.queryByText('Scan Success')).toBeNull()
  })

  it('shows the camera permission panel when access is not granted', () => {
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: false, canAskAgain: true }, jest.fn()])

    render(<ScanScreen />)

    expect(screen.getByTestId('scan-camera-permission-panel')).toBeTruthy()
    expect(screen.getByText('อนุญาตให้ใช้กล้อง')).toBeTruthy()
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

  it('queues the shared intake error when a consumed presentation QR is scanned', async () => {
    const requestUri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'
    isPresentationRequestConsumedMock.mockReturnValue(true)

    render(<ScanScreen />)

    await act(async () => {
      cameraMock.CameraView.mock.calls.at(-1)?.[0].onBarcodeScanned({ data: requestUri })
    })

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(useDeeplinkStore.getState().presentationIntakeError).toContain('ถูกดำเนินการแล้ว')
    expect(screen.getByText('Scan Header')).toBeTruthy()
  })
})
