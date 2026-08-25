import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'
import { readTrustAnyOid4vcPeerForClientId } from '@/src/config/oid4vcPeerTrustPolicy'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { findTrustedVerifier, type TrustedVerifier } from '@/src/services/vp/trustedVerifierMatcher'

export type DcApiTrustInput = {
  isSignedRequest: boolean
  /** True only after the existing signed JAR parser has authenticated the request. */
  signedRequestVerified?: boolean
  origin: string
  responseMode: 'dc_api' | 'dc_api.jwt'
  clientId?: string
  authorizationRequest: Record<string, unknown>
  trustedVerifiers: TrustedVerifier[]
  isDevelopment?: boolean
}

export type DcApiTrustResult =
  | { allowed: true; verifier?: TrustedVerifier }
  | { allowed: false; reason: string }

export function evaluateDcApiTrust(input: DcApiTrustInput): DcApiTrustResult {
  const isDevelopment = input.isDevelopment ?? __DEV__
  const isProductionRelease = process.env.EXPO_PUBLIC_BUILD_PROFILE === 'production'

  if (!isHttpsOrigin(input.origin)) {
    return { allowed: false, reason: 'PresentationRequestInvalid: DC API origin must be HTTPS' }
  }

  if (!input.isSignedRequest) {
    if (isProductionRelease) {
      return {
        allowed: false,
        reason: 'PresentationRequestUnsupported: unsigned dc_api is not supported in production release',
      }
    }
    if (!readWalletDemoInteropEnabled(isDevelopment)) {
      return {
        allowed: false,
        reason: 'PresentationRequestUnsupported: unsigned dc_api requires demo interop in development',
      }
    }
    return { allowed: true }
  }

  if (!input.signedRequestVerified) {
    return {
      allowed: false,
      reason: 'PresentationRequestInvalid: signed dc_api requires verified JAR evidence',
    }
  }

  if (!input.clientId) {
    return { allowed: false, reason: 'PresentationRequestInvalid: signed dc_api requires client_id' }
  }

  if (readString(input.authorizationRequest.client_id) !== input.clientId) {
    return { allowed: false, reason: 'PresentationRequestInvalid: signed dc_api client_id does not match JAR' }
  }

  if (readString(input.authorizationRequest.response_mode) !== input.responseMode) {
    return { allowed: false, reason: 'PresentationRequestInvalid: signed dc_api response_mode does not match JAR' }
  }

  if (!readExpectedOrigins(input.authorizationRequest).includes(input.origin)) {
    return {
      allowed: false,
      reason: 'PresentationRequestInvalid: signed dc_api expected_origins does not include the platform origin',
    }
  }

  const verifier = findTrustedVerifier(
    input.clientId,
    input.origin,
    input.trustedVerifiers,
    readTrustAnyOid4vcPeerForClientId(input.clientId) || readWalletDemoInteropEnabled(isDevelopment),
  )
  if (!verifier) {
    return { allowed: false, reason: 'PresentationRequestUntrusted: signed dc_api verifier not trusted' }
  }

  return { allowed: true, verifier }
}

export function readDcApiMdocAudience(origin: string): string {
  return `origin:${origin.replace(/\/$/, '')}`
}

function readExpectedOrigins(authorizationRequest: Record<string, unknown>): string[] {
  const value = authorizationRequest.expected_origins
  return Array.isArray(value) ? value.filter((origin): origin is string => typeof origin === 'string') : []
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isHttpsOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'https:' && parsed.origin === origin
  } catch (error) {
    logWalletError('oid4vp', 'dc-api-origin-invalid', error)
    return false
  }
}
