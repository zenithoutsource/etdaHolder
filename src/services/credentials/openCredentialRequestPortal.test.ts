import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import { notifyPortalReturnUrl, beginPortalReturnCapture } from './portalReturnBridge'

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'etdawallet:///'),
  openURL: jest.fn(),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn(),
  dismissAuthSession: jest.fn(),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

const { openAuthSessionAsync, openBrowserAsync } = jest.requireMock('expo-web-browser') as {
  openAuthSessionAsync: jest.Mock
  openBrowserAsync: jest.Mock
}

describe('openCredentialRequestPortal', () => {
  const originalLoginUrl = process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL
  const originalReturnUrl = process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/Account/Login'
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = 'walletapp://callback'
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
    openAuthSessionAsync.mockReset()
    openBrowserAsync.mockReset()
    openBrowserAsync.mockResolvedValue({ type: 'opened' })
    beginPortalReturnCapture()
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = originalLoginUrl
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = originalReturnUrl
  })

  test('opens login URL via openBrowserAsync on Android', async () => {
    setTimeout(() => {
      notifyPortalReturnUrl('walletapp://callback', 'test')
    }, 20)

    await openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 500,
    })

    expect(openBrowserAsync).toHaveBeenCalledWith(
      expect.stringContaining('/Account/Login'),
    )
    expect(openAuthSessionAsync).not.toHaveBeenCalled()
  })

  test('returns claimed when Android deep link notifies offer URI', async () => {
    const wrapped = 'walletapp://callback?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer'
    const normalized = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer'

    setTimeout(() => {
      notifyPortalReturnUrl(wrapped, 'test')
    }, 20)

    await expect(
      openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
        androidFallbackMs: 500,
      }),
    ).resolves.toEqual({ status: 'claimed', deeplink: normalized })
  })

  test('returns empty_offer when Issuer redirects to bare callback without offer', async () => {
    setTimeout(() => {
      notifyPortalReturnUrl('walletapp://callback', 'test')
    }, 20)

    const result = await openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 500,
    })
    expect(result.status).toBe('empty_offer')
  })

  test('returns empty_offer when Android wait times out with no deep link', async () => {
    const result = await openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 30,
    })
    expect(result.status).toBe('empty_offer')
    if (result.status === 'empty_offer') {
      expect(result.diagnostic).toContain('No walletapp://callback')
    }
  })
})
