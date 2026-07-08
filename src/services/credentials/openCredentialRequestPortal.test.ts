import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import { useDeeplinkStore } from '../../store/deeplinkStore'

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'etdawallet:///'),
  openURL: jest.fn(),
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

const { openAuthSessionAsync } = jest.requireMock('expo-web-browser') as {
  openAuthSessionAsync: jest.Mock
}

describe('openCredentialRequestPortal', () => {
  const originalTranscript = process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT = 'http://issuer.local/transcript'
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, offerGeneration: 0 })
    openAuthSessionAsync.mockReset()
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT = originalTranscript
  })

  test('returns misconfigured when portal URL missing', async () => {
    delete process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT

    await expect(
      openCredentialRequestPortal('BangkokUniversityTranscript'),
    ).resolves.toEqual({ status: 'misconfigured' })
    expect(openAuthSessionAsync).not.toHaveBeenCalled()
  })

  test('stores offer deeplink and returns claimed on success redirect', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer'
    openAuthSessionAsync.mockResolvedValue({ type: 'success', url: offerUri })

    await expect(
      openCredentialRequestPortal('BangkokUniversityTranscript'),
    ).resolves.toEqual({ status: 'claimed', deeplink: offerUri })
    expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
  })

  test('returns dismissed when browser cancelled', async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'cancel' })

    await expect(
      openCredentialRequestPortal('BangkokUniversityTranscript'),
    ).resolves.toEqual({ status: 'dismissed' })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  test('returns dismissed when success URL is not a credential offer', async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'https://issuer.local/done' })

    await expect(
      openCredentialRequestPortal('BangkokUniversityTranscript'),
    ).resolves.toEqual({ status: 'dismissed' })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  test('returns error when browser session throws', async () => {
    openAuthSessionAsync.mockRejectedValue(new Error('boom'))

    await expect(
      openCredentialRequestPortal('BangkokUniversityTranscript'),
    ).resolves.toEqual({ status: 'error' })
  })
})
