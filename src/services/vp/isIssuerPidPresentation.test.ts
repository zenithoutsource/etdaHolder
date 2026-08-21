import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { useSameDeviceIssuanceStore } from '../../store/sameDeviceIssuanceStore'
import { isIssuerPidPresentation } from './isIssuerPidPresentation'

jest.mock('../../config/trustedVerifiers', () => ({
  isIssuerOid4VpClientId: (clientId: string) => clientId === 'decentralized_identifier:did:web:issuer.example.com',
  isIssuerOid4VpResponseUri: (responseUri: string) => responseUri.startsWith('https://issuer.example.com'),
}))

const pidRecord = {
  id: 'pid-1',
  type: 'ThaiNationalID',
  rawVc: 'vc',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
} as VerifiableCredentialRecord

const licenceRecord = {
  ...pidRecord,
  id: 'dl-1',
  type: 'DLTDrivingLicence',
}

function makeRequest(overrides?: {
  type?: string
  clientId?: string
  responseUri?: string
  record?: VerifiableCredentialRecord
}) {
  return {
    clientId: overrides?.clientId ?? 'redirect_uri:https://verifier.example.com/cb',
    responseUri: overrides?.responseUri ?? 'https://verifier.example.com/cb',
    matchedCredential: overrides?.record
      ?? (overrides?.type
        ? { ...pidRecord, type: overrides.type }
        : pidRecord),
  }
}

describe('isIssuerPidPresentation', () => {
  beforeEach(() => {
    useSameDeviceIssuanceStore.getState().clearSession()
  })

  test('is false for a Verifier QR requesting ThaiNationalID', () => {
    expect(isIssuerPidPresentation(makeRequest())).toBe(false)
  })

  test('is true while same-device issuance is awaiting a PID VP', () => {
    useSameDeviceIssuanceStore.getState().setSession({
      id: 'session-1',
      credentialType: 'DLTDrivingLicence',
      phase: 'awaiting_pid_vp',
      codeVerifier: 'verifier',
      redirectUri: 'walletapp://callback',
    })

    expect(isIssuerPidPresentation(makeRequest())).toBe(true)
  })

  test('is true when the request matches the Issuer OID4VP allowlist', () => {
    expect(
      isIssuerPidPresentation(
        makeRequest({
          clientId: 'decentralized_identifier:did:web:issuer.example.com',
          responseUri: 'https://issuer.example.com/oid4vp/callback',
        }),
      ),
    ).toBe(true)
  })

  test('is false for a driving-licence match even during awaiting_pid_vp', () => {
    useSameDeviceIssuanceStore.getState().setSession({
      id: 'session-1',
      credentialType: 'DLTDrivingLicence',
      phase: 'awaiting_pid_vp',
      codeVerifier: 'verifier',
      redirectUri: 'walletapp://callback',
    })

    expect(isIssuerPidPresentation(makeRequest({ record: licenceRecord }))).toBe(false)
  })
})
