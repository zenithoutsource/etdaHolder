import { requestCredentialViaPortalFlow } from './requestCredentialViaPortalFlow'
import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import { consumeLastPortalReturn } from './lastPortalReturn'
import type { IssuanceCallbackLogSummary } from './describeIssuanceCallbackForLog'
import { WALLET_HOME_COPY } from './walletHomeCopy'

jest.mock('./openCredentialRequestPortal', () => ({
  openCredentialRequestPortal: jest.fn(),
}))

jest.mock('./lastPortalReturn', () => ({
  consumeLastPortalReturn: jest.fn(() => undefined),
}))

const emptyCallbackSummary: IssuanceCallbackLogSummary = {
  scheme: 'walletapp',
  host: 'callback',
  pathname: '/',
  queryKeys: [],
  hasCredentialOfferUri: false,
  hasCredentialOfferJson: false,
  hasCode: false,
  offerUriScheme: null,
  offerUriHost: null,
  offerUriPath: null,
  looksLikeOpenIdCredentialOffer: false,
  rawUrlBytes: 0,
}

const openCredentialRequestPortalMock = openCredentialRequestPortal as jest.MockedFunction<
  typeof openCredentialRequestPortal
>
const consumeLastPortalReturnMock = consumeLastPortalReturn as jest.MockedFunction<
  typeof consumeLastPortalReturn
>

describe('requestCredentialViaPortalFlow', () => {
  const router = { push: jest.fn() }
  const showDialog = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    useDeeplinkStore.setState({
      pendingUri: null,
      activeUri: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
    })
  })

  test('shows misconfigured dialog for unsupported credential type', async () => {
    await requestCredentialViaPortalFlow({
      credentialType: 'UnknownType',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).not.toHaveBeenCalled()
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.portalMisconfiguredTitle,
      }),
    )
  })

  test('routes claimed portal result to credential-offer', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({
      status: 'claimed',
      deeplink: 'walletapp://callback?credential_offer_uri=https://issuer/offer',
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'DLTDrivingLicence',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith('DLTDrivingLicence')
    expect(router.push).toHaveBeenCalledWith('/(tabs)/credential-offer')
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/scan')
  })

  test('opens issuer portal for document-expired reissue without routing to scan', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })

    await requestCredentialViaPortalFlow({
      credentialType: 'ChulalongkornUniversityTranscript',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith(
      'ChulalongkornUniversityTranscript',
    )
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/scan')
  })

  test('routes presentation_request to presentation-request', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({
      status: 'presentation_request',
      deeplink: 'openid4vp://request',
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(router.push).toHaveBeenCalledWith('/(tabs)/presentation-request')
  })

  test('shows empty-offer dialog with retry', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({
      status: 'empty_offer',
      reason: 'no_callback',
      diagnostic: 'timeout',
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.portalNoCallbackTitle,
        actions: expect.arrayContaining([
          expect.objectContaining({ label: WALLET_HOME_COPY.portalEmptyOfferRetry }),
        ]),
      }),
    )
  })

  test('routes pending credential-offer deeplink to credential-offer', async () => {
    openCredentialRequestPortalMock.mockImplementationOnce(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(
        'openid-credential-offer://issuer.example/offer',
      )
      return { status: 'dismissed' }
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(router.push).toHaveBeenCalledWith('/(tabs)/credential-offer')
  })

  test('does not route a pre-existing pending offer after the portal request is dismissed', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })
    useDeeplinkStore.setState({
      pendingUri: 'openid-credential-offer://issuer.example/previous-offer',
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(router.push).not.toHaveBeenCalled()
  })

  test('shows dialog for unrecognized last portal return', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })
    consumeLastPortalReturnMock.mockReturnValueOnce({
      at: Date.now(),
      credentialType: 'ThaiNationalID',
      resultType: 'success',
      source: 'auth-session',
      summary: emptyCallbackSummary,
      outcome: 'unrecognized',
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.portalEmptyOfferTitle,
      }),
    )
  })
})
