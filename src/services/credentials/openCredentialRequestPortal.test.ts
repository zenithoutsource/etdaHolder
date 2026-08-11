import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import { notifyPortalReturnUrl, beginPortalReturnCapture } from './portalReturnBridge'

let mockAppStateListener: ((nextState: string) => void) | undefined

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
    addEventListener: jest.fn((
      _event: string,
      listener: (nextState: string) => void,
    ) => {
      mockAppStateListener = listener
      return { remove: jest.fn() }
    }),
  },
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

const { getInitialURL } = jest.requireMock('expo-linking') as {
  getInitialURL: jest.Mock
}
const { openAuthSessionAsync, openBrowserAsync } = jest.requireMock('expo-web-browser') as {
  openAuthSessionAsync: jest.Mock
  openBrowserAsync: jest.Mock
}

describe('openCredentialRequestPortal', () => {
  const originalLoginUrl = process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL
  const originalReturnUrl = process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/thaiid/login'
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = 'walletapp://callback'
    useDeeplinkStore.setState({ pendingUri: null, activeUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
    openAuthSessionAsync.mockReset()
    openBrowserAsync.mockReset()
    getInitialURL.mockReset()
    getInitialURL.mockResolvedValue(null)
    mockAppStateListener = undefined
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
      expect.stringContaining('/thaiid/login'),
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
    if (result.status === 'empty_offer') {
      expect(result.reason).toBe('no_offer_in_callback')
    }
  })

  test('returns empty_offer when Android wait times out with no deep link', async () => {
    const result = await openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 30,
    })
    expect(result.status).toBe('empty_offer')
    if (result.status === 'empty_offer') {
      expect(result.reason).toBe('no_callback')
      expect(result.diagnostic).toContain('No walletapp://callback')
    }
  })

  test('returns superseded when a newer portal request replaces an in-flight wait', async () => {
    openBrowserAsync.mockImplementation(
      () => new Promise((resolve) => {
        setTimeout(() => resolve({ type: 'opened' }), 40)
      }),
    )

    const firstPromise = openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 2_000,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const wrapped = 'walletapp://callback?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer'
    setTimeout(() => {
      notifyPortalReturnUrl(wrapped, 'test')
    }, 60)

    const secondPromise = openCredentialRequestPortal('ThaiNationalID', {
      androidFallbackMs: 2_000,
    })

    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise])

    expect(firstResult).toEqual({ status: 'superseded' })
    expect(secondResult).toEqual({
      status: 'claimed',
      deeplink: 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
    })
  })

  test('ignores a pending offer that existed before the portal opened', async () => {
    const previousOffer = 'openid-credential-offer://issuer.example/previous-offer'
    useDeeplinkStore.setState({
      pendingUri: previousOffer,
    })

    const result = await openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 30,
    })

    expect(result.status).toBe('empty_offer')
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(useDeeplinkStore.getState().dismissedUri).toBe(previousOffer)
  })

  test('ignores a stale initial callback URL when the browser is dismissed', async () => {
    getInitialURL.mockResolvedValue(
      'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.local%2Fprevious-offer',
    )

    const resultPromise = openCredentialRequestPortal('ChulalongkornUniversityTranscript', {
      androidFallbackMs: 100,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    mockAppStateListener?.('active')

    const result = await resultPromise
    expect(result.status).toBe('empty_offer')
    expect(useDeeplinkStore.getState().dismissedUri).toBe(
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.local%2Fprevious-offer',
    )
  })
})
