import { requestCredentialViaPortalFlow } from './requestCredentialViaPortalFlow'
import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import { hasWalletPin } from '../auth/walletPin'
import { useAuthStore } from '../../store/authStore'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import { consumeLastPortalReturn } from './lastPortalReturn'
import type { IssuanceCallbackLogSummary } from './describeIssuanceCallbackForLog'
import { readPidGateStatus } from './credentialGuard'
import { WALLET_HOME_COPY } from './walletHomeCopy'

jest.mock('./openCredentialRequestPortal', () => ({
  openCredentialRequestPortal: jest.fn(),
}))

jest.mock('./lastPortalReturn', () => ({
  consumeLastPortalReturn: jest.fn(() => undefined),
}))

jest.mock('./storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('./credentialKeyRenewal', () => ({
  ...jest.requireActual('./credentialKeyRenewal'),
  readCredentialRenewalStatuses: jest.fn(() => ({})),
}))

jest.mock('../auth/walletPin', () => ({
  hasWalletPin: jest.fn(() => false),
}))

jest.mock('./credentialGuard', () => {
  const actual = jest.requireActual('./credentialGuard') as typeof import('./credentialGuard')
  return {
    ...actual,
    readPidGateStatus: jest.fn(() => 'ready'),
  }
})

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
const readPidGateStatusMock = readPidGateStatus as jest.MockedFunction<typeof readPidGateStatus>
const mockHasWalletPin = hasWalletPin as jest.MockedFunction<typeof hasWalletPin>

function lockWalletPinSession() {
  mockHasWalletPin.mockReturnValue(true)
  useAuthStore.setState({
    isAuthenticated: true,
    isPinVerified: false,
  })
}

function unlockWalletPinSession() {
  mockHasWalletPin.mockReturnValue(true)
  useAuthStore.setState({
    isAuthenticated: true,
    isPinVerified: true,
  })
}

describe('requestCredentialViaPortalFlow', () => {
  const router = { push: jest.fn() }
  const showDialog = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockHasWalletPin.mockReturnValue(false)
    useAuthStore.setState({
      token: null,
      walletId: null,
      accountId: null,
      isAuthenticated: false,
      isLoading: false,
      isPinVerified: false,
    })
    readPidGateStatusMock.mockReturnValue('ready')
    useDeeplinkStore.setState({
      pendingUri: null,
      activeUri: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
    })
  })

  test('shows misconfigured dialog for unsupported credential type', async () => {
    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'UnknownType',
      router,
      showDialog,
    })

    expect(outcome).toBe('abandoned')

    expect(openCredentialRequestPortalMock).not.toHaveBeenCalled()
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.portalMisconfiguredTitle,
      }),
    )
  })

  test('opens the DLT portal when the stored type is a DrivingLicense vct URL', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })

    await requestCredentialViaPortalFlow({
      credentialType: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith('DLTDrivingLicence')
    expect(showDialog).not.toHaveBeenCalled()
  })

  test('opens the transcript portal when the stored type is TranscriptCredential', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })

    await requestCredentialViaPortalFlow({
      credentialType: 'TranscriptCredential',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith('ChulalongkornUniversityTranscript')
    expect(showDialog).not.toHaveBeenCalled()
  })

  test('routes auth_code_claim_ready portal result to credential-offer', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'auth_code_claim_ready' })

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(router.push).toHaveBeenCalledWith('/(tabs)/credential-offer')
    expect(outcome).toBe('opened-claim')
  })

  test('routes auth_code_awaiting_pid_vp portal result to presentation-request', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'auth_code_awaiting_pid_vp' })

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'DLTDrivingLicence',
      router,
      showDialog,
    })

    expect(router.push).toHaveBeenCalledWith('/(tabs)/presentation-request')
    expect(outcome).toBe('opened-presentation')
  })

  test('routes claimed portal result to credential-offer', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({
      status: 'claimed',
      deeplink: 'walletapp://callback?credential_offer_uri=https://issuer/offer',
    })

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'DLTDrivingLicence',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith('DLTDrivingLicence')
    expect(router.push).toHaveBeenCalledWith('/(tabs)/credential-offer')
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/scan')
    expect(outcome).toBe('opened-claim')
  })

  test('opens issuer portal for document-expired reissue without routing to scan', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'ChulalongkornUniversityTranscript',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith(
      'ChulalongkornUniversityTranscript',
    )
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/scan')
    expect(outcome).toBe('abandoned')
  })

  test('routes presentation_request to presentation-request', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({
      status: 'presentation_request',
      deeplink: 'openid4vp://request',
    })

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(router.push).toHaveBeenCalledWith('/(tabs)/presentation-request')
    expect(outcome).toBe('opened-presentation')
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

  test('does not show empty-offer dialog when a portal wait is superseded by a retry', async () => {
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'superseded' })
    consumeLastPortalReturnMock.mockReturnValueOnce({
      at: Date.now(),
      credentialType: 'ThaiNationalID',
      resultType: 'timeout-or-cancel',
      source: 'none',
      summary: emptyCallbackSummary,
      outcome: 'empty-callback',
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(showDialog).not.toHaveBeenCalled()
    expect(consumeLastPortalReturnMock).not.toHaveBeenCalled()
  })

  test('blocks transcript reissue with the PID dialog when PID is suspended', async () => {
    readPidGateStatusMock.mockReturnValue('suspended')

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'ChulalongkornUniversityTranscript',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).not.toHaveBeenCalled()
    expect(outcome).toBe('blocked')
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.pidSuspendedTitle,
        message: WALLET_HOME_COPY.pidSuspendedMessage,
        actions: expect.arrayContaining([
          expect.objectContaining({ label: WALLET_HOME_COPY.requestThaId }),
        ]),
      }),
    )
  })

  test('blocks transcript request with the PID dialog when PID is missing', async () => {
    readPidGateStatusMock.mockReturnValue('missing')

    await requestCredentialViaPortalFlow({
      credentialType: 'ChulalongkornUniversityTranscript',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).not.toHaveBeenCalled()
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.pidRequiredTitle,
        message: WALLET_HOME_COPY.pidRequiredMessage,
      }),
    )
  })

  test('still opens the PID portal when PID is suspended', async () => {
    readPidGateStatusMock.mockReturnValue('suspended')
    openCredentialRequestPortalMock.mockResolvedValueOnce({ status: 'dismissed' })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(openCredentialRequestPortalMock).toHaveBeenCalledWith('ThaiNationalID')
  })

  test('does not navigate to credential-offer when PIN lock is required after a claimed portal result', async () => {
    unlockWalletPinSession()
    openCredentialRequestPortalMock.mockImplementationOnce(async () => {
      lockWalletPinSession()
      return {
        status: 'claimed' as const,
        deeplink: 'walletapp://callback?credential_offer_uri=https://issuer/offer',
      }
    })

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(outcome).toBe('opened-claim')
    expect(router.push).not.toHaveBeenCalled()
  })

  test('still shows the empty-offer dialog when PIN lock is required after the portal wait', async () => {
    unlockWalletPinSession()
    openCredentialRequestPortalMock.mockImplementationOnce(async () => {
      lockWalletPinSession()
      return {
        status: 'empty_offer' as const,
        reason: 'no_callback',
        diagnostic: 'timeout',
      }
    })

    await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WALLET_HOME_COPY.portalNoCallbackTitle,
      }),
    )
  })

  test('retry no-ops while PIN lock is required', async () => {
    lockWalletPinSession()

    const outcome = await requestCredentialViaPortalFlow({
      credentialType: 'ThaiNationalID',
      router,
      showDialog,
    })

    expect(outcome).toBe('abandoned')
    expect(openCredentialRequestPortalMock).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })
})
