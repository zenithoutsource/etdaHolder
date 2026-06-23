import {
  isCredentialOfferDeeplink,
  isSupportedWalletDeeplink,
  readPendingCredentialOfferRoute,
  useDeeplinkStore,
} from './deeplinkStore'

describe('deeplinkStore', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null })
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

  it('keeps a dismissed credential offer dismissed when a stale pending write repeats the same URI', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)
    useDeeplinkStore.getState().setPendingDeeplinkUri(pendingUri)

    expect(useDeeplinkStore.getState().dismissedUri).toBe(pendingUri)
    expect(readPendingCredentialOfferRoute({
      pendingUri: useDeeplinkStore.getState().pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
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
