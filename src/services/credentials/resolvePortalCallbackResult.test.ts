import { resolvePortalCallbackResult, waitForPortalCallbackCapture } from './resolvePortalCallbackResult'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import {
  configurePresentationReplayStorage,
  markPresentationRequestConsumed,
} from '../vp/presentationRequestReplay'

describe('waitForPortalCallbackCapture', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({
      pendingUri: null,
      activeUri: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
    })
    configurePresentationReplayStorage({
      getString: () => undefined,
      set: () => undefined,
    })
  })

  test('resolves when deeplink store receives offer during poll', async () => {
    setTimeout(() => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(
        'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
      )
    }, 30)

    await expect(
      waitForPortalCallbackCapture({
        getCapturedUrl: () => undefined,
        timeoutMs: 500,
        pollMs: 10,
      }),
    ).resolves.toBe(
      'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
    )
  })

  test('does not republish a consumed presentation callback', () => {
    const requestUri = 'openid4vp://authorize?client_id=verifier.example&response_type=vp_token'
    markPresentationRequestConsumed({ requestUri, nonce: 'nonce-123' })

    expect(resolvePortalCallbackResult(
      requestUri,
      'walletapp://callback',
      'ThaiNationalID',
    )).toBeUndefined()
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  test('does not republish a dismissed credential callback', () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setDismissedDeeplinkUri(offerUri)

    expect(resolvePortalCallbackResult(
      `walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer`,
      'walletapp://callback',
      'ThaiNationalID',
    )).toBeUndefined()
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })
})
