import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import type { PresentationFlowOrigin } from './oid4vc/types'
import {
  resolvePresentationRequest,
  type ResolvedPresentationRequest,
} from './presentationService'
import type { TrustedVerifier } from './trustedVerifierMatcher'

const resolveInflight = new Map<string, Promise<ResolvedPresentationRequest>>()

export function buildPresentationResolveCacheKey(
  authorizationRequestUri: string,
  presentableCredentialKey: string,
): string {
  return `${authorizationRequestUri}::${presentableCredentialKey}`
}

export function resolvePresentationRequestCached(
  authorizationRequestUri: string,
  presentableCredentialKey: string,
  presentableCredentials: VerifiableCredentialRecord[],
  options: {
    trustedVerifiers: TrustedVerifier[]
    presentationFlowOrigin: PresentationFlowOrigin
  },
): Promise<ResolvedPresentationRequest> {
  const cacheKey = buildPresentationResolveCacheKey(authorizationRequestUri, presentableCredentialKey)
  const existing = resolveInflight.get(cacheKey)
  if (existing) return existing

  const promise = resolvePresentationRequest(authorizationRequestUri, presentableCredentials, options)
    .finally(() => {
      if (resolveInflight.get(cacheKey) === promise) {
        resolveInflight.delete(cacheKey)
      }
    })

  resolveInflight.set(cacheKey, promise)
  return promise
}

/** Test-only helper */
export function clearPresentationResolveCacheForTests(): void {
  resolveInflight.clear()
}
