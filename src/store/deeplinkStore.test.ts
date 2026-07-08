import {
  isCredentialOfferDeeplink,
  isPresentationRequestDeeplink,
  isSupportedWalletDeeplink,
  readPendingCredentialOfferRoute,
  readPendingPresentationRoute,
  useDeeplinkStore,
} from './deeplinkStore'

describe('deeplinkStore', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
  })

  it('recognizes OID4VCI credential offer deeplinks', () => {
    expect(isSupportedWalletDeeplink('openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer')).toBe(true)
    expect(isCredentialOfferDeeplink('openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer')).toBe(true)
  })

  it('recognizes OID4VP authorization request deeplinks', () => {
    expect(isSupportedWalletDeeplink('openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token')).toBe(true)
    expect(isSupportedWalletDeeplink('https://verifier.example/request?response_type=vp_token')).toBe(true)
    expect(isCredentialOfferDeeplink('openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token')).toBe(false)
  })

  it('rejects unrelated deeplinks', () => {
    expect(isSupportedWalletDeeplink('etdawallet://wallet')).toBe(false)
    expect(isSupportedWalletDeeplink('not a url')).toBe(false)
  })

  it('consumes pending deeplink only once', () => {
    useDeeplinkStore.getState().setPendingDeeplinkUri('openid-credential-offer://?credential_offer={}')

    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe('openid-credential-offer://?credential_offer={}')
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBeNull()
  })

  it('waits to route pending credential offers until auth and PIN setup are ready', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    expect(readPendingCredentialOfferRoute({
      pendingUri,
      isAuthenticated: false,
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
    expect(readPendingCredentialOfferRoute({
      pendingUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: false,
    })).toBeUndefined()
    expect(readPendingCredentialOfferRoute({
      pendingUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/credential-offer')
  })

  it('does not route OID4VP requests to the credential offer route', () => {
    expect(readPendingCredentialOfferRoute({
      pendingUri: 'openid4vp://?response_type=vp_token',
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
  })

  it('detects presentation request deeplinks', () => {
    const uri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'
    expect(isPresentationRequestDeeplink(uri)).toBe(true)
    expect(isPresentationRequestDeeplink('openid-credential-offer://?credential_offer={}')).toBe(false)
  })

  it('routes pending VP deeplinks to scan when auth and PIN are ready', () => {
    expect(readPendingPresentationRoute({
      pendingUri: 'openid4vp://?response_type=vp_token',
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/scan')
  })

  it('increments vpGeneration when a VP deeplink is stored', () => {
    useDeeplinkStore.getState().setPendingDeeplinkUri('openid4vp://?response_type=vp_token&state=a')
    expect(useDeeplinkStore.getState().vpGeneration).toBe(1)
  })

  it('does not route a dismissed VP deeplink to scan', () => {
    const pendingUri = 'openid4vp://?response_type=vp_token'
    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)

    expect(readPendingPresentationRoute({
      pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
  })

  it('does not route a credential offer after the user dismisses that same URI', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)

    expect(readPendingCredentialOfferRoute({
      pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
  })

  it('reopens a previously dismissed URI when the user scans the same offer again', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)
    useDeeplinkStore.getState().setPendingDeeplinkUri(pendingUri)

    expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    expect(readPendingCredentialOfferRoute({
      pendingUri: useDeeplinkStore.getState().pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/credential-offer')
  })

  it('allows a fresh deeplink event to reopen a previously dismissed URI', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)
    useDeeplinkStore.getState().setIncomingDeeplinkUri(pendingUri)

    expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    expect(readPendingCredentialOfferRoute({
      pendingUri: useDeeplinkStore.getState().pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/credential-offer')
  })
})
