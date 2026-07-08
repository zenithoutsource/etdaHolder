import {
  buildPresentationSubmission,
  type ResolvedPresentationRequest,
} from './presentationService'
import { confirmPresentationBiometric, createApprovedPresentationResponse } from './presentationApproval'

const mockHasHardwareAsync = jest.fn()
const mockIsEnrolledAsync = jest.fn()
const mockAuthenticateAsync = jest.fn()
const mockIsNativeWeakBiometricAvailable = jest.fn()
const mockAuthenticateWeakBiometric = jest.fn()
const mockLogWalletStep = jest.fn()
const mockLogWalletError = jest.fn()

const biometricPromptMessage =
  '\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e15\u0e31\u0e27\u0e15\u0e19\u0e14\u0e49\u0e27\u0e22 Biometric'
const biometricCancelText = '\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01'

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolledAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
}))

jest.mock('../crypto/nativeEddsaSigner', () => ({
  authenticateWeakBiometric: (...args: unknown[]) => mockAuthenticateWeakBiometric(...args),
  isNativeWeakBiometricAvailable: () => mockIsNativeWeakBiometricAvailable(),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletError: (...args: unknown[]) => mockLogWalletError(...args),
  logWalletStep: (...args: unknown[]) => mockLogWalletStep(...args),
}))

const rawCredential = 'issuer.sd.jwt~disclosure~'

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
    type: 'BangkokUniversityTranscript',
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
    mockIsNativeWeakBiometricAvailable.mockReset()
    mockAuthenticateWeakBiometric.mockReset()
    mockLogWalletStep.mockReset()
    mockLogWalletError.mockReset()
    mockHasHardwareAsync.mockResolvedValue(true)
    mockIsEnrolledAsync.mockResolvedValue(true)
    mockAuthenticateAsync.mockResolvedValue({ success: true })
    mockIsNativeWeakBiometricAvailable.mockReturnValue(false)
    mockAuthenticateWeakBiometric.mockResolvedValue(true)
  })

  test('uses Android native weak biometric prompt when available', async () => {
    mockIsNativeWeakBiometricAvailable.mockReturnValueOnce(true)

    await confirmPresentationBiometric()

    expect(mockAuthenticateWeakBiometric).toHaveBeenCalledWith(biometricPromptMessage, biometricCancelText)
    expect(mockAuthenticateAsync).not.toHaveBeenCalled()
    expect(mockLogWalletStep).toHaveBeenCalledWith('oid4vp', 'biometric-native-weak-start')
    expect(mockLogWalletStep).toHaveBeenCalledWith('oid4vp', 'biometric-complete', {
      authenticator: 'android-native-biometric-weak',
    })
  })

  test('rejects when Android native weak biometric prompt is cancelled', async () => {
    mockIsNativeWeakBiometricAvailable.mockReturnValueOnce(true)
    mockAuthenticateWeakBiometric.mockResolvedValueOnce(false)

    await expect(confirmPresentationBiometric()).rejects.toThrow('PresentationBiometricCancelled')

    expect(mockAuthenticateAsync).not.toHaveBeenCalled()
  })

  test('uses biometric-only OS prompt without device credential fallback', async () => {
    await confirmPresentationBiometric()

    expect(mockAuthenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'ยืนยันตัวตนด้วย Biometric',
      cancelLabel: 'ยกเลิก',
      disableDeviceFallback: true,
    })
    expect(mockLogWalletStep).toHaveBeenCalledWith('oid4vp', 'biometric-expo-fallback-start')
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

    const response = await createApprovedPresentationResponse(requestWithDcql(false), {
      confirmBiometric,
    })

    expect(confirmBiometric).not.toHaveBeenCalled()
    expect(response).toEqual({ vpToken: rawCredential, presentationSubmission: undefined })
  })

  test('signs SD-JWT+KB presentation tokens without the raw biometric helper', async () => {
    const confirmBiometric = jest.fn()
    const signSdJwtKbPresentationToken = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')

    const response = await createApprovedPresentationResponse(requestWithDcql(true), {
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

    const response = await createApprovedPresentationResponse(request, {
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

    const response = await createApprovedPresentationResponse(request, {
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
