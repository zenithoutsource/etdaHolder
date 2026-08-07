import { parseIssuanceCallbackUrl } from '../credentials/parseIssuanceCallbackUrl'
import {
  notifyPresentationIntakeRejection,
  notifyPresentationIntakeRejectionForUri,
  PRESENTATION_REQUEST_ALREADY_HANDLED_MESSAGE,
  PRESENTATION_REQUEST_ALREADY_USED_MESSAGE,
  readPresentationIntakeRejection,
  readPresentationIntakeRejectionForUri,
} from './presentationIntakeRejection'
import { configurePresentationReplayStorage, markPresentationRequestConsumed } from './presentationRequestReplay'
import { useDeeplinkStore } from '../../store/deeplinkStore'

describe('presentationIntakeRejection', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({
      pendingUri: null,
      pendingPresentationFlowOrigin: null,
      activeUri: null,
      activePresentationFlowOrigin: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
      presentationIntakeError: null,
    })
    const values = new Map<string, string>()
    configurePresentationReplayStorage({
      getString: (key) => values.get(key),
      set: (key, value) => values.set(key, value),
    })
  })

  const requestUri = 'openid4vp://authorize?client_id=verifier.example&response_type=vp_token'
  const callbackUrl = `walletapp://callback?openid4vp=${encodeURIComponent(requestUri)}`

  test('detects a consumed presentation callback URL', () => {
    markPresentationRequestConsumed({ requestUri, nonce: 'nonce-1' })

    expect(readPresentationIntakeRejection(callbackUrl)).toBe('consumed')
    expect(readPresentationIntakeRejectionForUri(requestUri)).toBe('consumed')
  })

  test('detects a dismissed presentation URI', () => {
    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(readPresentationIntakeRejectionForUri(requestUri)).toBe('dismissed')
  })

  test('stores a consumed presentation error for deeplink intake', () => {
    markPresentationRequestConsumed({ requestUri, nonce: 'nonce-2' })

    expect(notifyPresentationIntakeRejection(callbackUrl)).toBe(true)
    expect(useDeeplinkStore.getState().presentationIntakeError).toBe(
      PRESENTATION_REQUEST_ALREADY_USED_MESSAGE,
    )
  })

  test('stores a dismissed presentation error for deeplink intake', () => {
    useDeeplinkStore.getState().setDismissedDeeplinkUri(requestUri)

    expect(notifyPresentationIntakeRejectionForUri(requestUri)).toBe(true)
    expect(useDeeplinkStore.getState().presentationIntakeError).toBe(
      PRESENTATION_REQUEST_ALREADY_HANDLED_MESSAGE,
    )
  })

  test('ignores unsupported URLs', () => {
    expect(readPresentationIntakeRejection('https://example.com')).toBeNull()
    expect(notifyPresentationIntakeRejection('https://example.com')).toBe(false)
    expect(parseIssuanceCallbackUrl('https://example.com').kind).toBe('unsupported')
  })
})
