import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { CredentialOfferClaimScreen } from './CredentialOfferClaimScreen'
import { useDeeplinkStore } from '../store/deeplinkStore'
import { acquireCredentialRecord, resolveOffer } from '../services/vci/exchangeService'
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

jest.mock('../services/credentials/credentialGuard', () => ({
  canRequestCredentialType: jest.fn(() => true),
  isPidCredentialOffer: jest.fn((offer) =>
    offer.credentialConfigurations.some((configuration: { id: string }) =>
      configuration.id.toLowerCase().includes('thai'),
    ),
  ),
  readPidGateStatus: jest.fn(() => 'ready'),
}))

jest.mock('../services/credentials/credentialKeyRenewal', () => ({
  readCredentialRenewalStatuses: jest.fn(() => ({})),
}))

jest.mock('../services/vci/exchangeService', () => ({
  resolveOffer: jest.fn(),
  acquireCredentialRecord: jest.fn(),
}))

const resolveOfferMock = resolveOffer as jest.Mock
const acquireCredentialRecordMock = acquireCredentialRecord as jest.Mock
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
    mockRouterCanGoBack.mockReturnValue(true)
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
    const offerUri = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.zenithcomp.co.th:455%2Fopenid4vc%2FcredentialOffer%3Fid%3D06c03c04-39ec-4287-b819-7bb72dd2395d'
    linkingMock.getInitialURL.mockResolvedValue(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'http://issuer.zenithcomp.co.th:455',
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

  it('uses the driving-licence preview panel for a driving-licence record', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fdriving-licence-offer'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'active-id-card',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ])
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'DLTDrivingLicence', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })
    acquireCredentialRecordMock.mockResolvedValue({
      id: 'driving-licence',
      type: 'DLTDrivingLicence',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('driving-licence-preview-panel')).toBeTruthy()
    })
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

  it('reopens a fresh offer after the user dismisses the claim screen and requests again', async () => {
    const firstOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer-1'
    const secondOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer-2'
    useDeeplinkStore.getState().setPendingDeeplinkUri(firstOfferUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(firstOfferUri)
    })

    resolveOfferMock.mockClear()
    await act(async () => {
      useDeeplinkStore.getState().setDismissedDeeplinkUri(firstOfferUri)
      useDeeplinkStore.getState().setIncomingDeeplinkUri(secondOfferUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(secondOfferUri)
    })
  })

  it('reopens the same offer after back navigation clears the started-offer guard', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))

    render(<CredentialOfferClaimScreen />)

    await screen.findByText('Back to Wallet')
    fireEvent.press(screen.getByText('Back to Wallet'))

    resolveOfferMock.mockClear()
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
  })

  it('waits for a pending offer before showing the missing-offer error', async () => {
    jest.useFakeTimers()
    linkingMock.getInitialURL.mockResolvedValue(null)

    render(<CredentialOfferClaimScreen />)

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(
        'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      )
    })

    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    await act(async () => {
      jest.advanceTimersByTime(2000)
    })

    expect(screen.queryByText('No credential offer link is pending.')).toBeNull()

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalled()
    })

    jest.useRealTimers()
  })

  it('returns to the tab shell when no navigation history exists', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useUrlMock.mockReturnValue(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))
    mockRouterCanGoBack.mockReturnValue(false)

    render(<CredentialOfferClaimScreen />)

    await screen.findByText('Back to Wallet')
    fireEvent.press(screen.getByText('Back to Wallet'))

    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)')
  })
})
