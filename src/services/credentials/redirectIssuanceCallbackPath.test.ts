import { redirectIssuanceCallbackPath, redirectWalletSystemPath } from './redirectIssuanceCallbackPath'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import {
  configurePresentationReplayStorage,
  markPresentationRequestConsumed,
} from '../vp/presentationRequestReplay'

function memoryReplayStorage() {
  const values = new Map<string, string>()
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('redirectIssuanceCallbackPath', () => {
  test('rewrites walletapp://callback with query to /callback route', () => {
    expect(
      redirectIssuanceCallbackPath(
        'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      ),
    ).toBe('/callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer')
  })

  test('rewrites walletapp://callback without query', () => {
    expect(redirectIssuanceCallbackPath('walletapp://callback')).toBe('/callback')
  })

  test('passes through unrelated paths', () => {
    expect(
      redirectIssuanceCallbackPath(
        'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fx',
      ),
    ).toBe('openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fx')
  })
})

describe('redirectWalletSystemPath', () => {
  const requestUri =
    'openid4vp://authorize?client_id=redirect_uri:https%3A%2F%2Fverifier.example%2Fverify%2Fid&request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fid'

  beforeEach(() => {
    configurePresentationReplayStorage(memoryReplayStorage())
    useDeeplinkStore.setState({
      pendingUri: null,
      pendingPresentationFlowOrigin: null,
      activeUri: null,
      activePresentationFlowOrigin: null,
      dismissedUri: null,
      dismissedAtMs: null,
      offerGeneration: 0,
      vpGeneration: 0,
      presentationIntakeError: null,
    })
  })

  test('rewrites openid4vp authorize deeplink to presentation-request route', () => {
    expect(redirectWalletSystemPath(requestUri)).toBe('/(tabs)/presentation-request')
  })

  test('rewrites walletapp presentation callback straight to presentation-request', () => {
    expect(
      redirectWalletSystemPath(
        `walletapp://callback?authorization_request_uri=${encodeURIComponent(requestUri)}`,
      ),
    ).toBe('/(tabs)/presentation-request')
  })

  test('still rewrites credential-offer walletapp callback to /callback', () => {
    expect(
      redirectWalletSystemPath(
        'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      ),
    ).toBe('/callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer')
  })

  test('ignores a consumed openid4vp deeplink on warm app so Wallet is not remounted', () => {
    markPresentationRequestConsumed({ requestUri })

    expect(redirectWalletSystemPath(requestUri, { initial: false })).toBeNull()
    expect(useDeeplinkStore.getState().presentationIntakeError).toContain('ถูกดำเนินการแล้ว')
  })

  test('lands on tabs for a consumed openid4vp deeplink on cold start', () => {
    markPresentationRequestConsumed({ requestUri })

    expect(redirectWalletSystemPath(requestUri, { initial: true })).toBe('/(tabs)')
  })

  test('ignores a consumed walletapp presentation callback on warm app', () => {
    const callbackUrl =
      `walletapp://callback?authorization_request_uri=${encodeURIComponent(requestUri)}`
    markPresentationRequestConsumed({ requestUri })

    expect(redirectWalletSystemPath(callbackUrl, { initial: false })).toBeNull()
    expect(useDeeplinkStore.getState().presentationIntakeError).toContain('ถูกดำเนินการแล้ว')
  })

  test('silently ignores a dismissed openid4vp deeplink within redelivery grace', () => {
    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(redirectWalletSystemPath(requestUri, { initial: false })).toBeNull()
    expect(useDeeplinkStore.getState().presentationIntakeError).toBeNull()
  })

  test('reopens a dismissed openid4vp deeplink after redelivery grace expires', () => {
    jest.useFakeTimers()
    try {
      useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)
      jest.advanceTimersByTime(2_000)

      expect(redirectWalletSystemPath(requestUri, { initial: false })).toBe(
        '/(tabs)/presentation-request',
      )
      expect(useDeeplinkStore.getState().dismissedUri).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  test('lands on tabs for a dismissed openid4vp deeplink on cold start within grace', () => {
    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(redirectWalletSystemPath(requestUri, { initial: true })).toBe('/(tabs)')
    expect(useDeeplinkStore.getState().presentationIntakeError).toBeNull()
  })
})
