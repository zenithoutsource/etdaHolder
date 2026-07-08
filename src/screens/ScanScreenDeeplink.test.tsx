import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import ScanScreen from '../../app/(tabs)/scan'
import { useDeeplinkStore } from '../store/deeplinkStore'
import { readSingleNfcPayload, NfcDisabledError } from '../services/nfc/nfcTagService'

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

jest.mock('../services/nfc/nfcTagService', () => ({
  cancelNfcRead: jest.fn(),
  readSingleNfcPayload: jest.fn(),
  NfcDisabledError: class NfcDisabledError extends Error {},
  NfcUnsupportedTagError: class NfcUnsupportedTagError extends Error {},
  NfcReadCancelledError: class NfcReadCancelledError extends Error {},
  NfcUnsupportedError: class NfcUnsupportedError extends Error {},
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

const readSingleNfcPayloadMock = readSingleNfcPayload as jest.MockedFunction<typeof readSingleNfcPayload>
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
    readSingleNfcPayloadMock.mockReset()
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

  it('stores NFC credential-offer payloads in the deeplink store', async () => {
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-offer'
    readSingleNfcPayloadMock.mockResolvedValue({
      kind: 'credential-offer',
      uri: offerUri,
    })

    render(<ScanScreen />)

    fireEvent.press(screen.getByText('Use NFC'))

    await waitFor(() => {
      expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
    })
  })

  it('routes NFC OID4VP payloads into the existing scan handler', async () => {
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])
    const requestUri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'
    presentationServiceMock.isOid4VpAuthorizationRequest.mockImplementation((uri: string) => uri === requestUri)
    readSingleNfcPayloadMock.mockResolvedValue({
      kind: 'oid4vp',
      uri: requestUri,
    })

    render(<ScanScreen />)

    fireEvent.press(screen.getByText('Use NFC'))

    await waitFor(() => {
      expect(presentationServiceMock.resolvePresentationRequest).toHaveBeenCalled()
    })
  })

  it('shows a direct message when NFC is disabled', async () => {
    cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])
    readSingleNfcPayloadMock.mockRejectedValue(new NfcDisabledError('NFC is disabled'))

    render(<ScanScreen />)

    fireEvent.press(screen.getByText('Use NFC'))

    expect(await screen.findByText('Please enable NFC in Settings and try again.')).toBeOnTheScreen()
  })
})
