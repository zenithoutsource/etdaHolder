import {
  buildIssuanceCallbackUrlFromSearchParams,
  resolveIssuanceCallbackFromSources,
  storePendingFromIssuanceCallbackUrl,
} from './resolveIssuanceCallbackResult'
import { useDeeplinkStore } from '../../store/deeplinkStore'

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
})

describe('buildIssuanceCallbackUrlFromSearchParams', () => {
  test('returns undefined when params empty', () => {
    expect(buildIssuanceCallbackUrlFromSearchParams({}, 'walletapp://callback')).toBeUndefined()
  })
})

describe('storePendingFromIssuanceCallbackUrl', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
  })

  test('stores normalized offer from walletapp callback before pin unlock', () => {
    storePendingFromIssuanceCallbackUrl(
      'walletapp://callback?openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    )

    expect(useDeeplinkStore.getState().pendingUri).toBe(
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
    )
  })
})
