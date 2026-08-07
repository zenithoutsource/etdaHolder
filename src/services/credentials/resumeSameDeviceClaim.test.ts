import { useSameDeviceIssuanceStore } from '../../store/sameDeviceIssuanceStore'
import { resumeSameDeviceClaimFromSession } from './resumeSameDeviceClaim'
import type { ResolvedCredentialOffer } from '../vci/exchangeService'

jest.mock('./sameDeviceIssuance', () => ({
  continueSameDeviceIssuanceAfterPortal: jest.fn(),
  prepareSameDeviceClaimAfterPidVp: jest.fn(),
}))

const { continueSameDeviceIssuanceAfterPortal } = jest.requireMock('./sameDeviceIssuance') as {
  continueSameDeviceIssuanceAfterPortal: jest.Mock
}

const resolvedOffer = {
  offerUri: 'same-device-authorization-code://local',
  issuer: 'https://issuer.example.com',
  credentialConfigurations: [{ id: 'IDCard_dc+sd-jwt', requestId: 'IDCard_dc+sd-jwt', format: 'dc+sd-jwt', rawConfiguration: {} }],
  supportedFlows: ['authorization_code'],
} as unknown as ResolvedCredentialOffer

describe('resumeSameDeviceClaimFromSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useSameDeviceIssuanceStore.setState({ session: null })
  })

  test('returns claim_ready from persisted session fields', async () => {
    useSameDeviceIssuanceStore.setState({
      session: {
        id: 'session-1',
        credentialType: 'ThaiNationalID',
        phase: 'claim',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        resolvedOffer,
        authorizationExchange: {
          authorizationCode: 'auth-code',
          codeVerifier: 'verifier',
          redirectUri: 'walletapp://callback',
          clientId: 'wallet-client',
          tokenEndpoint: 'https://issuer.example.com/token',
        },
      },
    })

    const resume = await resumeSameDeviceClaimFromSession()
    expect(resume.status).toBe('claim_ready')
    if (resume.status === 'claim_ready') {
      expect(resume.authorizationCodeExchange.authorizationCode).toBe('auth-code')
      expect(resume.resolvedOffer).toBe(resolvedOffer)
    }
    expect(continueSameDeviceIssuanceAfterPortal).not.toHaveBeenCalled()
  })

  test('returns awaiting_pid_vp when session phase requires VP', async () => {
    useSameDeviceIssuanceStore.setState({
      session: {
        id: 'session-2',
        credentialType: 'DLTDrivingLicence',
        phase: 'awaiting_pid_vp',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        authorizationCode: 'auth-code',
      },
    })

    expect(await resumeSameDeviceClaimFromSession()).toEqual({ status: 'awaiting_pid_vp' })
  })
})
