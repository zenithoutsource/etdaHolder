import { waitForPortalCallbackCapture } from './resolvePortalCallbackResult'
import { useDeeplinkStore } from '../../store/deeplinkStore'

describe('waitForPortalCallbackCapture', () => {
  beforeEach(() => {
    useDeeplinkStore.setState({
      pendingUri: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
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
})
