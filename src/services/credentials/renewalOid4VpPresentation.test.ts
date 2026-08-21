import { presentOldCredentialForRenewal } from './renewalOid4VpPresentation'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const mockMarkPresentationRequestConsumed = jest.fn()
jest.mock('../vp/presentationRequestReplay', () => ({
  markPresentationRequestConsumed: (...args: unknown[]) => mockMarkPresentationRequestConsumed(...args),
}))

describe('presentOldCredentialForRenewal', () => {
  const credential: VerifiableCredentialRecord = {
    id: 'urn:uuid:old',
    type: 'ThaiNationalID',
    rawVc: 'eyJ.test',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
  }

  test('resolves Issuer OID4VP, signs with previous-key helpers, and submits VP', async () => {
    mockMarkPresentationRequestConsumed.mockClear()
    const resolvePresentationRequest = jest.fn().mockResolvedValue({
      matchedCredential: credential,
      verifier: { name: 'Dev Renewal Issuer' },
      requestUri: 'openid4vp://renewal/request-1',
      responseUri: 'http://localhost:4000/wallet-api/dev/wallet/renewal-vp/response',
      clientId: 'redirect_uri:http://localhost:4000/wallet-api/dev/wallet/renewal-vp/response',
      nonce: 'n1',
    })
    const buildApprovedPresentationResponse = jest.fn().mockResolvedValue({
      vpToken: 'vp.token',
    })
    const submitPresentationResponse = jest.fn().mockResolvedValue({ status: 'verified' })
    const signSdJwtKb = jest.fn()
    const signVp = jest.fn()
    const fetchImpl = jest.fn() as unknown as typeof fetch

    await presentOldCredentialForRenewal('openid4vp://authorize?nonce=1', credential, {
      fetchImpl,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://localhost:4000/wallet-api/dev/wallet/renewal-vp/response',
          name: 'Dev Renewal Issuer',
          allowedOrigins: ['http://localhost:4000'],
        },
      ],
      resolvePresentationRequest,
      buildApprovedPresentationResponse,
      submitPresentationResponse,
      signSdJwtKbPresentationTokenWithPreviousKey: signSdJwtKb,
      signPresentationVpTokenWithPreviousKey: signVp,
    })

    expect(resolvePresentationRequest).toHaveBeenCalledWith(
      'openid4vp://authorize?nonce=1',
      [credential],
      expect.objectContaining({
        fetchImpl,
        presentationFlowOrigin: 'issuer-renewal',
      }),
    )
    expect(buildApprovedPresentationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ matchedCredential: credential }),
      {
        signSdJwtKbPresentationToken: signSdJwtKb,
        signPresentationVpToken: signVp,
      },
    )
    expect(submitPresentationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ matchedCredential: credential }),
      expect.objectContaining({ vpToken: 'vp.token', fetchImpl }),
    )
    expect(mockMarkPresentationRequestConsumed).toHaveBeenCalledWith({
      requestUri: 'openid4vp://renewal/request-1',
      nonce: 'n1',
    })
  })

  test('rejects leftover Ed25519 old-key renewal when hardware P-256 is on', async () => {
    const resolvePresentationRequest = jest.fn()

    await expect(
      presentOldCredentialForRenewal('openid4vp://authorize?nonce=1', credential, {
        isHardwareEnabled: () => true,
        hasHardwareKey: () => false,
        resolvePresentationRequest,
        buildApprovedPresentationResponse: jest.fn(),
        submitPresentationResponse: jest.fn(),
      }),
    ).rejects.toThrow('Legacy key renewal presentation is unsupported')
    expect(resolvePresentationRequest).not.toHaveBeenCalled()
  })

  test('signs with this credential k_cred when hardware P-256 is on', async () => {
    mockMarkPresentationRequestConsumed.mockClear()
    const resolvePresentationRequest = jest.fn().mockResolvedValue({
      matchedCredential: credential,
      verifier: { name: 'Dev Renewal Issuer' },
      requestUri: 'openid4vp://renewal/request-1',
      nonce: 'n1',
    })
    const buildApprovedPresentationResponse = jest.fn().mockResolvedValue({
      vpToken: 'vp.token',
    })
    const submitPresentationResponse = jest.fn().mockResolvedValue({ status: 'verified' })
    const signSdJwtKb = jest.fn()
    const signVp = jest.fn()
    const signSdJwtKbPrevious = jest.fn()
    const signVpPrevious = jest.fn()

    await presentOldCredentialForRenewal('openid4vp://authorize?nonce=1', credential, {
      isHardwareEnabled: () => true,
      hasHardwareKey: (id) => id === credential.id,
      resolvePresentationRequest,
      buildApprovedPresentationResponse,
      submitPresentationResponse,
      signSdJwtKbPresentationToken: signSdJwtKb,
      signPresentationVpToken: signVp,
      signSdJwtKbPresentationTokenWithPreviousKey: signSdJwtKbPrevious,
      signPresentationVpTokenWithPreviousKey: signVpPrevious,
    })

    expect(buildApprovedPresentationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ matchedCredential: credential }),
      {
        signSdJwtKbPresentationToken: signSdJwtKb,
        signPresentationVpToken: signVp,
      },
    )
    expect(signSdJwtKbPrevious).not.toHaveBeenCalled()
    expect(signVpPrevious).not.toHaveBeenCalled()
  })

  test('rejects when matched credential is not the renewing VC', async () => {
    await expect(
      presentOldCredentialForRenewal('openid4vp://authorize?nonce=1', credential, {
        resolvePresentationRequest: jest.fn().mockResolvedValue({
          matchedCredential: { ...credential, id: 'other' },
          verifier: { name: 'Dev Renewal Issuer' },
        }),
        buildApprovedPresentationResponse: jest.fn(),
        submitPresentationResponse: jest.fn(),
      }),
    ).rejects.toThrow('CredentialRenewalVpMismatch')
  })
})
