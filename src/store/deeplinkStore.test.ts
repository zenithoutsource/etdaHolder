import {
  isCredentialOfferDeeplink,
  isPresentationRequestDeeplink,
  isSupportedWalletDeeplink,
  readPendingCredentialOfferRoute,
  readPendingPresentationRoute,
  tryQueueDeeplinkUri,
  useDeeplinkStore,
} from './deeplinkStore'

describe('deeplinkStore', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({
      pendingUri: null,
      pendingPresentationFlowOrigin: null,
      pendingOfferFlowOrigin: null,
      activeUri: null,
      activePresentationFlowOrigin: null,
      activeOfferFlowOrigin: null,
      dismissedUri: null,
      dismissedAtMs: null,
      offerGeneration: 0,
      vpGeneration: 0,
      routeEpoch: 0,
      presentationIntakeError: null,
    })
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

  it('does not create a new offer generation for duplicate pending delivery', () => {
    const offerUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)

    expect(useDeeplinkStore.getState().offerGeneration).toBe(1)
  })

  it('does not republish a consumed offer while that same offer is active', () => {
    const offerUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe(offerUri)

    useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)

    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(useDeeplinkStore.getState().offerGeneration).toBe(1)
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

  it('routes pending VP deeplinks to presentation-request when auth and PIN are ready', () => {
    expect(readPendingPresentationRoute({
      pendingUri: 'openid4vp://?response_type=vp_token',
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/presentation-request')
  })

  it('increments vpGeneration when a VP deeplink is stored', () => {
    useDeeplinkStore.getState().setPendingDeeplinkUri('openid4vp://?response_type=vp_token&state=a')
    expect(useDeeplinkStore.getState().vpGeneration).toBe(1)
  })

  it('does not route a dismissed VP deeplink to presentation-request', () => {
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

  it('reopens a previously dismissed URI when Scan clears dismiss then queues again', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)
    useDeeplinkStore.getState().clearDismissedDeeplinkUri()
    expect(tryQueueDeeplinkUri(pendingUri, { origin: 'scan' })).toBe(true)

    expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    expect(readPendingCredentialOfferRoute({
      pendingUri: useDeeplinkStore.getState().pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/credential-offer')
  })

  it('does not reopen a dismissed URI via setPending without clearDismissed', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)
    useDeeplinkStore.getState().setPendingDeeplinkUri(pendingUri)

    expect(useDeeplinkStore.getState().dismissedUri).toBe(pendingUri)
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  it('does not reopen a dismissed URI via Linking-style setIncoming (redelivery)', () => {
    const pendingUri = 'openid-credential-offer://?credential_offer={}'

    useDeeplinkStore.getState().setDismissedDeeplinkUri(pendingUri)
    useDeeplinkStore.getState().setIncomingDeeplinkUri(pendingUri)

    expect(useDeeplinkStore.getState().dismissedUri).toBe(pendingUri)
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(readPendingCredentialOfferRoute({
      pendingUri: useDeeplinkStore.getState().pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
  })

  it('stores scan origin when a VP request is handed off from Scan', () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=scan'

    useDeeplinkStore.getState().setPendingPresentationRequest({ uri: requestUri, origin: 'scan' })

    expect(useDeeplinkStore.getState().pendingUri).toBe(requestUri)
    expect(useDeeplinkStore.getState().pendingPresentationFlowOrigin).toBe('scan')
  })

  it('stores same-device origin when a VP callback is queued', () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=callback'

    useDeeplinkStore.getState().setPendingPresentationRequest({ uri: requestUri, origin: 'same-device' })

    expect(useDeeplinkStore.getState().pendingPresentationFlowOrigin).toBe('same-device')
  })

  it('persists scan origin on activeUri when the VP deeplink is consumed', () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=consume'

    useDeeplinkStore.getState().setPendingPresentationRequest({ uri: requestUri, origin: 'scan' })
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe(requestUri)

    expect(useDeeplinkStore.getState().pendingPresentationFlowOrigin).toBeNull()
    expect(useDeeplinkStore.getState().activePresentationFlowOrigin).toBe('scan')
  })

  it('reopens a previously dismissed VP URI only after clearDismissed (Scan reopen)', () => {
    const requestUri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token&state=a'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe(requestUri)
    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(tryQueueDeeplinkUri(requestUri)).toBe(false)
    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)

    useDeeplinkStore.getState().clearDismissedDeeplinkUri()
    expect(tryQueueDeeplinkUri(requestUri, { origin: 'scan' })).toBe(true)

    expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    expect(useDeeplinkStore.getState().pendingUri).toBe(requestUri)
    expect(useDeeplinkStore.getState().vpGeneration).toBe(2)
    expect(readPendingPresentationRoute({
      pendingUri: useDeeplinkStore.getState().pendingUri,
      dismissedUri: useDeeplinkStore.getState().dismissedUri,
      isAuthenticated: true,
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)/presentation-request')
  })

  it('clears a stale active URI when a different VP deeplink is queued', () => {
    const firstUri = 'openid4vp://?response_type=vp_token&state=active-first'
    const secondUri = 'openid4vp://?response_type=vp_token&state=pending-second'

    useDeeplinkStore.getState().setPendingDeeplinkUri(firstUri)
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe(firstUri)
    expect(useDeeplinkStore.getState().activeUri).toBe(firstUri)

    useDeeplinkStore.getState().setIncomingDeeplinkUri(secondUri)

    expect(useDeeplinkStore.getState().activeUri).toBeNull()
    expect(useDeeplinkStore.getState().pendingUri).toBe(secondUri)
    expect(useDeeplinkStore.getState().vpGeneration).toBe(2)
  })

  it('bumps routeEpoch when a deeplink is dismissed so pending can be re-routed', () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=epoch'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    expect(useDeeplinkStore.getState().routeEpoch).toBe(0)

    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(useDeeplinkStore.getState().routeEpoch).toBe(1)
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  it('tryQueueDeeplinkUri rejects a dismissed URI within redelivery grace', () => {
    const requestUri = 'openid4vp://?response_type=vp_token&state=blocked-redelivery'

    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(tryQueueDeeplinkUri(requestUri)).toBe(false)
    expect(useDeeplinkStore.getState().dismissedUri).toBe(requestUri)
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  it('tryQueueDeeplinkUri reopens the same URI after redelivery grace expires', () => {
    jest.useFakeTimers()
    try {
      const requestUri = 'openid4vp://?response_type=vp_token&state=retap-after-grace'

      useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)
      expect(tryQueueDeeplinkUri(requestUri)).toBe(false)

      jest.advanceTimersByTime(2_000)
      expect(tryQueueDeeplinkUri(requestUri, { origin: 'same-device' })).toBe(true)
      expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
      expect(useDeeplinkStore.getState().pendingUri).toBe(requestUri)
    } finally {
      jest.useRealTimers()
    }
  })

  it('stores scan origin when a credential offer is handed off from Scan', () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'

    useDeeplinkStore.getState().setPendingCredentialOffer({ uri: offerUri, origin: 'scan' })

    expect(useDeeplinkStore.getState().pendingUri).toBe(offerUri)
    expect(useDeeplinkStore.getState().pendingOfferFlowOrigin).toBe('scan')
  })

  it('stores same-device origin when an offer arrives via incoming deeplink', () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'

    useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)

    expect(useDeeplinkStore.getState().pendingOfferFlowOrigin).toBe('same-device')
  })

  it('persists scan origin on activeUri when the offer deeplink is consumed', () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'

    useDeeplinkStore.getState().setPendingCredentialOffer({ uri: offerUri, origin: 'scan' })
    expect(useDeeplinkStore.getState().consumePendingDeeplinkUri()).toBe(offerUri)

    expect(useDeeplinkStore.getState().pendingOfferFlowOrigin).toBeNull()
    expect(useDeeplinkStore.getState().activeOfferFlowOrigin).toBe('scan')
  })
})
