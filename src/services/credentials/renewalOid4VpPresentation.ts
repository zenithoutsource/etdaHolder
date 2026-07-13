import { TRUSTED_VERIFIERS } from '@/src/config/trustedVerifiers'
import {
  signPresentationVpTokenWithPreviousKey,
  signSdJwtKbPresentationTokenWithPreviousKey,
} from '../crypto/crypto'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { buildApprovedPresentationResponse } from '../vp/presentationApproval'
import {
  resolvePresentationRequest,
  submitPresentationResponse,
  type ResolvedPresentationRequest,
} from '../vp/presentationService'
import type { TrustedVerifier } from '../vp/trustedVerifierMatcher'

export type SilentRenewalOid4VpDependencies = {
  fetchImpl: typeof fetch
  trustedVerifiers: TrustedVerifier[]
  resolvePresentationRequest: typeof resolvePresentationRequest
  buildApprovedPresentationResponse: typeof buildApprovedPresentationResponse
  submitPresentationResponse: typeof submitPresentationResponse
  signSdJwtKbPresentationTokenWithPreviousKey: typeof signSdJwtKbPresentationTokenWithPreviousKey
  signPresentationVpTokenWithPreviousKey: typeof signPresentationVpTokenWithPreviousKey
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
    signSdJwtKbPresentationTokenWithPreviousKey,
    signPresentationVpTokenWithPreviousKey,
    ...dependencies,
  }
}

/**
 * Silent Issuer OID4VP for P3 renewal (steps 5–6): present the renewing old VC
 * with PoP signed by the previous Keychain seed. No Holder consent UI.
 */
export async function presentOldCredentialForRenewal(
  authorizationRequest: string,
  credential: VerifiableCredentialRecord,
  dependencies: Partial<SilentRenewalOid4VpDependencies> = {},
): Promise<void> {
  const resolved = resolveDependencies(dependencies)

  logWalletStep('renewal', 'oid4vp-auth-start', {
    credentialId: credential.id,
    credentialType: credential.type,
    requestBytes: authorizationRequest.length,
  })

  let request: ResolvedPresentationRequest
  try {
    request = await resolved.resolvePresentationRequest(
      authorizationRequest,
      [credential],
      {
        fetchImpl: resolved.fetchImpl,
        trustedVerifiers: resolved.trustedVerifiers,
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
    signSdJwtKbPresentationToken: resolved.signSdJwtKbPresentationTokenWithPreviousKey,
    signPresentationVpToken: resolved.signPresentationVpTokenWithPreviousKey,
  })

  await resolved.submitPresentationResponse(request, {
    vpToken: presentation.vpToken,
    presentationSubmission: presentation.presentationSubmission,
    fetchImpl: resolved.fetchImpl,
  })

  logWalletStep('renewal', 'oid4vp-auth-complete', {
    credentialId: credential.id,
    verifierName: request.verifier.name,
  })
}
