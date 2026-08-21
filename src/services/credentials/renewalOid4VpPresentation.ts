import { TRUSTED_VERIFIERS } from '@/src/config/trustedVerifiers'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import {
  signPresentationVpToken,
  signPresentationVpTokenWithPreviousKey,
  signSdJwtKbPresentationToken,
  signSdJwtKbPresentationTokenWithPreviousKey,
} from '../crypto/crypto'
import { assertHardwareCutoverLegacyRenewalBlocked } from '../crypto/cutoverMigrationPolicy'
import { hasHardwareCredentialKey } from '../crypto/hardwareCredentialSigningKey'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { buildApprovedPresentationResponse } from '../vp/presentationApproval'
import {
  resolvePresentationRequest,
  submitPresentationResponse,
  type ResolvedPresentationRequest,
} from '../vp/presentationService'
import { markPresentationRequestConsumed } from '../vp/presentationRequestReplay'
import type { TrustedVerifier } from '../vp/trustedVerifierMatcher'

export type SilentRenewalOid4VpDependencies = {
  fetchImpl: typeof fetch
  trustedVerifiers: TrustedVerifier[]
  resolvePresentationRequest: typeof resolvePresentationRequest
  buildApprovedPresentationResponse: typeof buildApprovedPresentationResponse
  submitPresentationResponse: typeof submitPresentationResponse
  signSdJwtKbPresentationToken: typeof signSdJwtKbPresentationToken
  signPresentationVpToken: typeof signPresentationVpToken
  signSdJwtKbPresentationTokenWithPreviousKey: typeof signSdJwtKbPresentationTokenWithPreviousKey
  signPresentationVpTokenWithPreviousKey: typeof signPresentationVpTokenWithPreviousKey
  isHardwareEnabled?: () => boolean
  hasHardwareKey?: (credentialId: string) => boolean
}

function resolveDependencies(
  dependencies: Partial<SilentRenewalOid4VpDependencies> = {},
): SilentRenewalOid4VpDependencies {
  return {
    fetchImpl: fetch,
    trustedVerifiers: TRUSTED_VERIFIERS,
    resolvePresentationRequest,
    buildApprovedPresentationResponse,
    submitPresentationResponse,
    signSdJwtKbPresentationToken,
    signPresentationVpToken,
    signSdJwtKbPresentationTokenWithPreviousKey,
    signPresentationVpTokenWithPreviousKey,
    isHardwareEnabled: isHardwareP256SigningEnabled,
    hasHardwareKey: hasHardwareCredentialKey,
    ...dependencies,
  }
}

/**
 * Silent Issuer OID4VP for P3 renewal (steps 5–6). Hardware k_cred signs with
 * this credential’s key (one biometric on that sign). Flag-off Ed25519 uses the
 * previous wallet seed. Leftover Ed25519 while hardware is on is rejected.
 */
export async function presentOldCredentialForRenewal(
  authorizationRequest: string,
  credential: VerifiableCredentialRecord,
  dependencies: Partial<SilentRenewalOid4VpDependencies> = {},
): Promise<void> {
  const resolved = resolveDependencies(dependencies)
  assertHardwareCutoverLegacyRenewalBlocked(credential.id, {
    isHardwareEnabled: resolved.isHardwareEnabled,
    hasHardwareKey: resolved.hasHardwareKey,
  })

  const useLiveCredentialKey = Boolean(
    resolved.isHardwareEnabled?.() && resolved.hasHardwareKey?.(credential.id),
  )

  logWalletStep('renewal', 'oid4vp-auth-start', {
    credentialId: credential.id,
    credentialType: credential.type,
    requestBytes: authorizationRequest.length,
    useLiveCredentialKey,
  })

  let request: ResolvedPresentationRequest
  try {
    request = await resolved.resolvePresentationRequest(
      authorizationRequest,
      [credential],
      {
        fetchImpl: resolved.fetchImpl,
        trustedVerifiers: resolved.trustedVerifiers,
        presentationFlowOrigin: 'issuer-renewal',
      },
    )
  } catch (error) {
    logWalletError('renewal', 'oid4vp-resolve-failed', error, { credentialId: credential.id })
    throw error
  }

  if (request.matchedCredential.id !== credential.id) {
    throw new Error(
      `CredentialRenewalVpMismatch: expected ${credential.id}, matched ${request.matchedCredential.id}`,
    )
  }

  const presentation = await resolved.buildApprovedPresentationResponse(request, {
    signSdJwtKbPresentationToken: useLiveCredentialKey
      ? resolved.signSdJwtKbPresentationToken
      : resolved.signSdJwtKbPresentationTokenWithPreviousKey,
    signPresentationVpToken: useLiveCredentialKey
      ? resolved.signPresentationVpToken
      : resolved.signPresentationVpTokenWithPreviousKey,
  })

  await resolved.submitPresentationResponse(request, {
    vpToken: presentation.vpToken,
    presentationSubmission: presentation.presentationSubmission,
    fetchImpl: resolved.fetchImpl,
  })
  markPresentationRequestConsumed({
    requestUri: request.requestUri,
    nonce: request.nonce,
  })

  logWalletStep('renewal', 'oid4vp-auth-complete', {
    credentialId: credential.id,
    verifierName: request.verifier.name,
  })
}
