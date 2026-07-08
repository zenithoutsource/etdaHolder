import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { CredentialOfferClaimScreen } from './CredentialOfferClaimScreen'
import { useDeeplinkStore } from '../store/deeplinkStore'
import { resolveOffer } from '../services/vci/exchangeService'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import { readStoredCredentials } from '../services/credentials/storedCredentials'

jest.mock('../components/AppDialog', () => ({
  useAppDialog: () => ({ showDialog: jest.fn() }),
}))

jest.mock('expo-camera', () => {
  throw new Error('CredentialOfferClaimScreen must not import expo-camera')
})

const mockRouterReplace = jest.fn()
const mockRouterBack = jest.fn()
const mockRouterCanGoBack = jest.fn(() => true)

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    back: mockRouterBack,
    canGoBack: mockRouterCanGoBack,
  }),
}))

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  useURL: jest.fn(() => null),
}))

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({
    credentials: [],
    refresh: jest.fn(),
  }),
}))

jest.mock('../services/credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('../services/vci/exchangeService', () => ({
  resolveOffer: jest.fn(),
  acquireCredentialRecord: jest.fn(),
}))

const resolveOfferMock = resolveOffer as jest.Mock
const readStoredCredentialsMock = readStoredCredentials as jest.Mock
const linkingMock = jest.requireMock('expo-linking') as {
  getInitialURL: jest.Mock<Promise<string | null>, []>
  useURL: jest.Mock<string | null, []>
}
const useUrlMock = linkingMock.useURL

describe('CredentialOfferClaimScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRouterReplace.mockClear()
    linkingMock.getInitialURL.mockResolvedValue(null)
    useUrlMock.mockReturnValue(null)
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null })
    readStoredCredentialsMock.mockReturnValue([])
  })

  it('consumes a pending credential offer deeplink and resolves it without camera permission', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  it('falls back to the current Linking URL when no pending store value exists', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useUrlMock.mockReturnValue(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
  })

  it('resolves a new pending offer when the hidden tab screen is already mounted', async () => {
    const idCardOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-offer'
    const transcriptOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ftranscript-offer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(idCardOfferUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(idCardOfferUri)
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(transcriptOfferUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(transcriptOfferUri)
    })
  })

  it('waits for the initial launch URL before showing a missing pending offer error', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2F192.100.10.46%2Fopenid4vc%2FcredentialOffer%3Fid%3D06c03c04-39ec-4287-b819-7bb72dd2395d'
    linkingMock.getInitialURL.mockResolvedValue(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'http://192.100.10.46',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(screen.queryByText('No credential offer link is pending.')).toBeNull()
  })

  it('allows ThaiNationalID re-issue when only document-expired PID exists', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-offer'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'id-card-expired',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    ])

    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(screen.queryByText(WALLET_HOME_COPY.renewThaIdRequiredMessage)).toBeNull()
  })

  it('dismisses the active deeplink before navigating back to wallet', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useUrlMock.mockReturnValue(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))

    render(<CredentialOfferClaimScreen />)

    await screen.findByText('Back to Wallet')
    fireEvent.press(screen.getByText('Back to Wallet'))

    expect(useDeeplinkStore.getState().dismissedUri).toBe(offerUri)
    expect(mockRouterBack).toHaveBeenCalled()
  })
})
