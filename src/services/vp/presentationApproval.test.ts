import {
  buildPresentationSubmission,
  type ResolvedPresentationRequest,
} from './presentationService'
import { confirmPresentationBiometric, createApprovedPresentationResponse } from './presentationApproval'

const mockHasHardwareAsync = jest.fn()
const mockIsEnrolledAsync = jest.fn()
const mockAuthenticateAsync = jest.fn()
const mockLogWalletStep = jest.fn()
const mockLogWalletError = jest.fn()

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolledAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletError: (...args: unknown[]) => mockLogWalletError(...args),
  logWalletStep: (...args: unknown[]) => mockLogWalletStep(...args),
}))

const rawCredential = 'issuer.sd.jwt~disclosure~'
const filteredSdJwt = 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~'

const baseRequest: ResolvedPresentationRequest = {
  requestUri: 'openid4vp://authorize',
  clientId: 'redirect_uri:https://verifier.example.com/verify/request-123',
  responseUri: 'https://verifier.example.com/verify/request-123',
  responseMode: 'direct_post',
  nonce: 'nonce-123',
  state: 'state-123',
  verifier: {
    clientId: 'redirect_uri:https://verifier.example.com/verify',
    name: 'Verifier API',
    allowedOrigins: ['https://verifier.example.com'],
  },
  matchedCredential: {
    id: 'credential-1',
    type: 'ChulalongkornUniversityTranscript',
    rawVc: rawCredential,
    claims: {},
    issuedAt: '2026-06-01T10:00:00.000Z',
  },
  disclosures: [{ key: 'credential', label: 'Credential', value: 'Academic Transcript' }],
}

function requestWithDcql(requireHolderBinding: boolean): ResolvedPresentationRequest {
  return {
    ...baseRequest,
    dcqlQuery: {
      credentials: [
        {
          id: 'transcript_credential',
          format: 'dc+sd-jwt',
          require_cryptographic_holder_binding: requireHolderBinding,
        },
      ],
    },
  }
}

describe('presentationApproval', () => {
  beforeEach(() => {
    mockHasHardwareAsync.mockReset()
    mockIsEnrolledAsync.mockReset()
    mockAuthenticateAsync.mockReset()
    mockLogWalletStep.mockReset()
    mockLogWalletError.mockReset()
    mockHasHardwareAsync.mockResolvedValue(true)
    mockIsEnrolledAsync.mockResolvedValue(true)
    mockAuthenticateAsync.mockResolvedValue({ success: true })
  })

  test('uses biometric-only OS prompt without device credential fallback', async () => {
    await confirmPresentationBiometric()

    expect(mockAuthenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'ยืนยันตัวตนด้วย Biometric',
      cancelLabel: 'ยกเลิก',
      disableDeviceFallback: true,
    })
    expect(mockLogWalletStep).toHaveBeenCalledWith('oid4vp', 'biometric-expo-start')
    expect(mockLogWalletStep).toHaveBeenCalledWith('oid4vp', 'biometric-sensor-available', {
      hasHardware: true,
      isEnrolled: true,
    })
    expect(mockLogWalletStep).toHaveBeenCalledWith('oid4vp', 'biometric-complete', {
      authenticator: 'expo-local-authentication',
    })
  })

  test('rejects when biometric sensor is unavailable', async () => {
    mockIsEnrolledAsync.mockResolvedValueOnce(false)

    await expect(confirmPresentationBiometric()).rejects.toThrow('PresentationBiometricUnavailable')

    expect(mockAuthenticateAsync).not.toHaveBeenCalled()
  })

  test('rejects when the OS biometric prompt is cancelled', async () => {
    mockAuthenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' })

    await expect(confirmPresentationBiometric()).rejects.toThrow('PresentationBiometricCancelled')
  })

  test('returns raw credential presentation tokens without a second biometric prompt', async () => {
    const confirmBiometric = jest.fn().mockResolvedValue(undefined)

    const response = await createApprovedPresentationResponse(requestWithDcql(false), {}, {
      confirmBiometric,
    } as never)

    expect(confirmBiometric).not.toHaveBeenCalled()
    expect(response).toEqual({ vpToken: rawCredential, presentationSubmission: undefined })
  })

  test('filters SD-JWT disclosures even when holder binding is not requested', async () => {
    const request: ResolvedPresentationRequest = {
      ...requestWithDcql(false),
      disclosures: [{ key: 'name', label: 'Name', value: 'Alice' }],
      matchedCredential: {
        ...baseRequest.matchedCredential,
        rawVc: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~WyJzYWx0LWFnZSIsImFnZSIsMjVd~',
      },
      dcqlQuery: {
        credentials: [
          {
            id: 'transcript_credential',
            format: 'dc+sd-jwt',
            claims: [{ path: ['name'] }],
            require_cryptographic_holder_binding: false,
          },
        ],
      },
    }

    const response = await createApprovedPresentationResponse(request, {}, {
      confirmBiometric: jest.fn(),
    } as never)

    expect(response).toEqual({
      vpToken: filteredSdJwt,
      presentationSubmission: undefined,
    })
  })

  test('signs SD-JWT+KB presentation tokens without the raw biometric helper', async () => {
    const confirmBiometric = jest.fn()
    const signSdJwtKbPresentationToken = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')

    const response = await createApprovedPresentationResponse(requestWithDcql(true), {}, {
      confirmBiometric,
      signSdJwtKbPresentationToken,
    })

    expect(confirmBiometric).not.toHaveBeenCalled()
    expect(signSdJwtKbPresentationToken).toHaveBeenCalledWith({
      audience: baseRequest.clientId,
      nonce: 'nonce-123',
      sdJwt: rawCredential,
    })
    expect(response).toEqual({ vpToken: 'sd-jwt~kb.jwt', presentationSubmission: undefined })
  })

  test('passes only DCQL-requested SD-JWT disclosures to the signer', async () => {
    const request: ResolvedPresentationRequest = {
      ...requestWithDcql(true),
      disclosures: [{ key: 'name', label: 'Name', value: 'Alice' }],
      matchedCredential: {
        ...baseRequest.matchedCredential,
        rawVc: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~WyJzYWx0LWFnZSIsImFnZSIsMjVd~',
      },
      dcqlQuery: {
        credentials: [
          {
            id: 'transcript_credential',
            format: 'dc+sd-jwt',
            claims: [{ path: ['name'] }],
            require_cryptographic_holder_binding: true,
          },
        ],
      },
    }
    const signSdJwtKbPresentationToken = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')

    await createApprovedPresentationResponse(request, {}, { signSdJwtKbPresentationToken })

    expect(signSdJwtKbPresentationToken).toHaveBeenCalledWith({
      audience: request.clientId,
      nonce: request.nonce,
      sdJwt: filteredSdJwt,
    })
  })

  test('passes holder-selected SD-JWT disclosure keys to the signer', async () => {
    const request: ResolvedPresentationRequest = {
      ...requestWithDcql(true),
      disclosures: [
        { key: 'name', label: 'Name', value: 'Alice', mandatory: false, selective: true },
        { key: 'age', label: 'Age', value: '25', mandatory: true, selective: false },
      ],
      matchedCredential: {
        ...baseRequest.matchedCredential,
        rawVc: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~WyJzYWx0LWFnZSIsImFnZSIsMjVd~',
      },
      dcqlQuery: {
        credentials: [
          {
            id: 'transcript_credential',
            format: 'dc+sd-jwt',
            claims: [{ path: ['name'] }, { path: ['age'] }],
            require_cryptographic_holder_binding: true,
          },
        ],
      },
    }
    const signSdJwtKbPresentationToken = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')

    await createApprovedPresentationResponse(request, { selectedClaimKeys: ['age'] }, { signSdJwtKbPresentationToken })

    expect(signSdJwtKbPresentationToken).toHaveBeenCalledWith({
      audience: request.clientId,
      nonce: request.nonce,
      sdJwt: 'issuer.sd.jwt~WyJzYWx0LWFnZSIsImFnZSIsMjVd~',
    })
  })

  test('builds dual-format DCQL vp_token envelopes without presentation_submission', async () => {
    const request: ResolvedPresentationRequest = {
      ...baseRequest,
      dcqlQuery: {
        credentials: [
          { id: 'transcript_sd_jwt', format: 'dc+sd-jwt', require_cryptographic_holder_binding: true },
          { id: 'transcript_mdoc', format: 'mso_mdoc' },
        ],
      },
    }

    const buildApprovedPresentationResponse = jest
      .fn()
      .mockResolvedValue({
        vpToken: '{"transcript_sd_jwt":["sd-jwt~kb.jwt"],"transcript_mdoc":["mdoc"]}',
      })

    const response = await createApprovedPresentationResponse(request, {}, {
      buildApprovedPresentationResponse,
    })

    expect(buildApprovedPresentationResponse).toHaveBeenCalled()
    expect(response.vpToken).toContain('transcript_sd_jwt')
  })

  test('signs Presentation Exchange VP JWT tokens and returns presentation_submission', async () => {
    const request: ResolvedPresentationRequest = {
      ...baseRequest,
      presentationDefinition: {
        id: 'age-over-20',
        input_descriptors: [{ id: 'thai-id-age' }],
      },
    }
    const signPresentationVpToken = jest.fn().mockResolvedValue('vp.jwt')

    const response = await createApprovedPresentationResponse(request, {}, {
      signPresentationVpToken,
    })

    expect(signPresentationVpToken).toHaveBeenCalledWith({
      audience: baseRequest.clientId,
      nonce: 'nonce-123',
      verifiableCredential: rawCredential,
    })
    expect(response).toEqual({
      vpToken: 'vp.jwt',
      presentationSubmission: buildPresentationSubmission(request),
    })
  })
})
