import { act, render, screen, waitFor } from '@testing-library/react-native'
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

jest.mock('expo-linking', () => ({
  useURL: jest.fn(() => null),
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

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({
    credentials: [],
    refresh: jest.fn(),
  }),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('../services/credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('../services/credentials/scannedCredentialSave', () => ({
  saveScannedCredential: jest.fn(),
}))

jest.mock('../services/history/presentationHistory', () => ({
  recordSuccessfulPresentation: jest.fn(),
}))

jest.mock('../services/vci/exchangeService', () => ({
  acquireCredentialRecord: jest.fn(),
  resolveOffer: jest.fn(),
}))

jest.mock('../services/vp/presentationApproval', () => ({
  confirmPresentationBiometric: jest.fn(),
  createApprovedPresentationResponse: jest.fn(),
}))

const cameraMock = jest.requireMock('expo-camera') as {
  CameraView: jest.Mock
  useCameraPermissions: jest.Mock
}

jest.mock('../services/vp/presentationService', () => ({
  isOid4VpAuthorizationRequest: jest.fn(() => false),
  readPresentationTokenAudience: jest.fn(),
  readPresentationTokenMode: jest.fn(),
  resolvePresentationRequest: jest.fn(),
  submitPresentationResponse: jest.fn(),
}))

const presentationServiceMock = jest.requireMock('../services/vp/presentationService') as {
  isOid4VpAuthorizationRequest: jest.Mock
  resolvePresentationRequest: jest.Mock
}

describe('ScanScreen deeplink handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRouterReplace.mockClear()
    mockRouterPush.mockClear()
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: false }, jest.fn()])
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
    presentationServiceMock.isOid4VpAuthorizationRequest.mockReturnValue(false)
    presentationServiceMock.resolvePresentationRequest.mockResolvedValue({
      verifier: { name: 'Verifier' },
      matchedCredential: { id: 'cred-1', type: 'ThaiNationalID' },
      disclosures: [],
      presentationDefinition: null,
    })
  })

  it('stores pending credential offer URI without navigating from Scan', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ftranscript-offer'

    render(<ScanScreen />)

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)
    })

    expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(screen.queryByText(`Claiming ${offerUri}`)).toBeNull()
  })

  it('stores scanned credential-offer QR in deeplink store for root layout routing', async () => {
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-offer'

    render(<ScanScreen />)

    await act(async () => {
      cameraMock.CameraView.mock.calls.at(-1)?.[0].onBarcodeScanned({ data: offerUri })
    })

    expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(screen.queryByText('Scan Success')).toBeNull()
  })

  it('processes pending OID4VP deeplink into resolvePresentationRequest', async () => {
    const requestUri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'
    presentationServiceMock.isOid4VpAuthorizationRequest.mockImplementation((uri: string) => uri === requestUri)
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])

    render(<ScanScreen />)

    await act(async () => {
      useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    })

    await waitFor(() => {
      expect(presentationServiceMock.resolvePresentationRequest).toHaveBeenCalled()
    })
  })

})
