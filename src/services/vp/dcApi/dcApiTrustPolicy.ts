import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'
import { readTrustAnyOid4vcPeerForClientId } from '@/src/config/oid4vcPeerTrustPolicy'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { parseAuthorizationRequestBody } from '@/src/services/vp/authorizationRequestJar'
import { findTrustedVerifier, type TrustedVerifier } from '@/src/services/vp/trustedVerifierMatcher'
import { decodeJsonBase64Url, looksLikeCompactJwt, readString } from '@/src/utils/jwtUtils'

export type AuthenticatedDcApiSignedRequest = {
  clientId: string
  responseMode: 'dc_api' | 'dc_api.jwt'
  authorizationRequest: Record<string, unknown>
}

export type DcApiTrustInput =
  | {
      isSignedRequest: false
      origin: string
      responseMode: 'dc_api' | 'dc_api.jwt'
      authorizationRequest: Record<string, unknown>
      trustedVerifiers: TrustedVerifier[]
      isDevelopment?: boolean
    }
  | {
      isSignedRequest: true
      origin: string
      signedRequest: AuthenticatedDcApiSignedRequest
      trustedVerifiers: TrustedVerifier[]
      isDevelopment?: boolean
    }

export type DcApiTrustResult =
  | { allowed: true; verifier?: TrustedVerifier }
  | { allowed: false; reason: string }

const authenticatedSignedRequests = new WeakSet<object>()

/**
 * Authenticates a compact signed DC API request through the established JAR
 * parser. Task 6 must call this before passing signed evidence to policy.
 */
export async function authenticateDcApiSignedRequest(input: {
  request: string
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
}): Promise<AuthenticatedDcApiSignedRequest> {
  assertCompactSignedJar(input.request)
  const authorizationRequest = await parseAuthorizationRequestBody(input.request, {
    trustedVerifiers: input.trustedVerifiers,
    fetchImpl: input.fetchImpl,
  })
  if (!authorizationRequest) {
    throw new Error('PresentationRequestInvalid: signed dc_api request is empty')
  }

  const clientId = readString(authorizationRequest.client_id)
  if (!clientId) {
    throw new Error('PresentationRequestInvalid: signed dc_api requires client_id')
  }

  const responseMode = readDcApiResponseMode(authorizationRequest.response_mode)
  if (!responseMode) {
    throw new Error('PresentationRequestInvalid: signed dc_api requires dc_api response_mode')
  }

  const authenticatedRequest = { clientId, responseMode, authorizationRequest }
  authenticatedSignedRequests.add(authenticatedRequest)
  return authenticatedRequest
}

export function evaluateDcApiTrust(input: DcApiTrustInput): DcApiTrustResult {
  const origin = readCanonicalHttpsOrigin(input.origin)
  if (!origin) {
    return { allowed: false, reason: 'PresentationRequestInvalid: DC API origin must be HTTPS' }
  }

  const isDevelopment = input.isDevelopment ?? __DEV__
  const isProductionRelease = process.env.EXPO_PUBLIC_BUILD_PROFILE === 'production'

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

  if (!authenticatedSignedRequests.has(input.signedRequest)) {
    return {
      allowed: false,
      reason: 'PresentationRequestInvalid: signed dc_api requires authenticated JAR evidence',
    }
  }

  if (!readExpectedOrigins(input.signedRequest.authorizationRequest).some((expectedOrigin) =>
    readCanonicalHttpsOrigin(expectedOrigin) === origin,
  )) {
    return {
      allowed: false,
      reason: 'PresentationRequestInvalid: signed dc_api expected_origins does not include the platform origin',
    }
  }

  const verifier = findTrustedVerifier(
    input.signedRequest.clientId,
    origin,
    input.trustedVerifiers,
    readTrustAnyOid4vcPeerForClientId(input.signedRequest.clientId) || readWalletDemoInteropEnabled(isDevelopment),
  )
  if (!verifier) {
    return { allowed: false, reason: 'PresentationRequestUntrusted: signed dc_api verifier not trusted' }
  }

  return { allowed: true, verifier }
}

export function readDcApiMdocAudience(origin: string): string {
  const canonicalOrigin = readCanonicalHttpsOrigin(origin)
  if (!canonicalOrigin) {
    throw new Error('PresentationRequestInvalid: DC API origin must be HTTPS')
  }
  return `origin:${canonicalOrigin}`
}

function assertCompactSignedJar(request: string): void {
  const trimmed = request.trim()
  if (!looksLikeCompactJwt(trimmed)) {
    throw new Error('PresentationRequestInvalid: signed dc_api request must be a compact JAR')
  }

  const [headerSegment, , signatureSegment] = trimmed.split('.')
  const header = headerSegment ? decodeJsonBase64Url<Record<string, unknown>>(headerSegment) : undefined
  if (!signatureSegment || readString(header?.alg) === 'none' || !readString(header?.alg)) {
    throw new Error('PresentationRequestInvalid: signed dc_api request must have a JAR signature')
  }
}

function readDcApiResponseMode(value: unknown): 'dc_api' | 'dc_api.jwt' | undefined {
  return value === 'dc_api' || value === 'dc_api.jwt' ? value : undefined
}

function readExpectedOrigins(authorizationRequest: Record<string, unknown>): string[] {
  const value = authorizationRequest.expected_origins
  return Array.isArray(value) ? value.filter((origin): origin is string => typeof origin === 'string') : []
}

function readCanonicalHttpsOrigin(origin: string): string | undefined {
  try {
    const parsed = new URL(origin)
    const canonical = parsed.origin
    if (parsed.protocol !== 'https:' || (origin !== canonical && origin !== `${canonical}/`)) {
      return undefined
    }
    return canonical
  } catch (error) {
    logWalletError('oid4vp', 'dc-api-origin-invalid', error)
    return undefined
  }
}
