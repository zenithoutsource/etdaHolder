import {
  buildIssuanceCallbackUrlFromSearchParams,
  resolveIssuanceCallbackFromSources,
  storePendingFromIssuanceCallbackUrl,
} from './resolveIssuanceCallbackResult'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import {
  configurePresentationReplayStorage,
  markPresentationRequestConsumed,
} from '../vp/presentationRequestReplay'

describe('resolveIssuanceCallbackFromSources', () => {
  const returnUrl = 'walletapp://callback'

  test('prefers Linking URL when it carries an offer', () => {
    expect(
      resolveIssuanceCallbackFromSources({
        linkingUrl: 'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
        searchParams: {},
        returnUrl,
      }),
    ).toEqual({
      kind: 'credential_offer',
      uri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    })
  })

  test('rebuilds offer from Expo Router search params when Linking URL is missing', () => {
    expect(
      resolveIssuanceCallbackFromSources({
        linkingUrl: null,
        searchParams: {
          credential_offer_uri: 'https://issuer.example/offer',
        },
        returnUrl,
      }),
    ).toEqual({
      kind: 'credential_offer',
      uri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    })
  })

  test('rebuilds when Linking URL is stale non-callback and search params have offer', () => {
    expect(
      resolveIssuanceCallbackFromSources({
        linkingUrl: 'walletapp://expo-development-client/?url=http%3A%2F%2F192.168.1.1%3A8081',
        searchParams: {
          credential_offer_uri: 'https://issuer.example/offer',
        },
        returnUrl,
      }),
    ).toEqual({
      kind: 'credential_offer',
      uri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    })
  })

  test('returns unsupported when neither source has an offer', () => {
    expect(
      resolveIssuanceCallbackFromSources({
        linkingUrl: null,
        searchParams: {},
        returnUrl,
      }),
    ).toEqual({ kind: 'unsupported' })
  })

  test('parses presentation request from walletapp callback search params', () => {
    expect(
      resolveIssuanceCallbackFromSources({
        linkingUrl: null,
        searchParams: {
          authorization_request_uri: 'https://verifier.example/request/abc',
        },
        returnUrl,
      }),
    ).toEqual({
      kind: 'presentation_request',
      uri: 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fabc',
    })
  })
})

describe('buildIssuanceCallbackUrlFromSearchParams', () => {
  test('returns undefined when params empty', () => {
    expect(buildIssuanceCallbackUrlFromSearchParams({}, 'walletapp://callback')).toBeUndefined()
  })
})

describe('storePendingFromIssuanceCallbackUrl', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({ pendingUri: null, activeUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
    configurePresentationReplayStorage({
      getString: () => undefined,
      set: () => undefined,
    })
  })

  test('stores normalized offer from walletapp callback before pin unlock', () => {
    storePendingFromIssuanceCallbackUrl(
      'walletapp://callback?openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    )

    expect(useDeeplinkStore.getState().pendingUri).toBe(
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    )
  })

  test('does not resurrect a dismissed credential offer when the initial URL is replayed', () => {
    const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setDismissedDeeplinkUri(offer)

    storePendingFromIssuanceCallbackUrl(
      'walletapp://callback?openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    )

    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(useDeeplinkStore.getState().dismissedUri).toBe(offer)
  })

  test('stores normalized presentation request from walletapp callback before pin unlock', () => {
    const embedded = 'openid4vp://authorize?client_id=verifier.example&response_type=vp_token'
    storePendingFromIssuanceCallbackUrl(
      `walletapp://callback?openid4vp=${encodeURIComponent(embedded)}`,
    )

    expect(useDeeplinkStore.getState().pendingUri).toBe(embedded)
    expect(useDeeplinkStore.getState().vpGeneration).toBe(1)
  })

  test('does not resurrect a dismissed presentation callback when the initial URL is replayed', () => {
    const embedded = 'openid4vp://authorize?client_id=verifier.example&response_type=vp_token'
    useDeeplinkStore.getState().setDismissedDeeplinkUri(embedded)

    storePendingFromIssuanceCallbackUrl(
      `walletapp://callback?openid4vp=${encodeURIComponent(embedded)}`,
    )

    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(useDeeplinkStore.getState().dismissedUri).toBe(embedded)
  })

  test('does not queue a presentation callback after its durable replay record survives restart', () => {
    const embedded = 'openid4vp://authorize?client_id=verifier.example&response_type=vp_token'
    const values = new Map<string, string>()
    const storage = {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
    }
    configurePresentationReplayStorage(storage)
    markPresentationRequestConsumed({ requestUri: embedded, nonce: 'nonce-123' })
    configurePresentationReplayStorage(storage)

    storePendingFromIssuanceCallbackUrl(
      `walletapp://callback?openid4vp=${encodeURIComponent(embedded)}`,
    )

    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })
})
