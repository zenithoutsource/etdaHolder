import type { AuthorizationCodeExchangeInput, ResolvedCredentialOffer } from '../vci/exchangeService'
import {
  continueSameDeviceIssuanceAfterPortal,
  prepareSameDeviceClaimAfterPidVp,
  type SameDeviceIssuanceContinuation,
} from './sameDeviceIssuance'
import { readActiveSameDeviceSession } from '../../store/sameDeviceIssuanceStore'

export type SameDeviceClaimResume =
  | {
    status: 'claim_ready'
    resolvedOffer: ResolvedCredentialOffer
    authorizationCodeExchange: AuthorizationCodeExchangeInput
  }
  | { status: 'awaiting_pid_vp' }
  | { status: 'no_session' }

function toClaimReady(continuation: Extract<SameDeviceIssuanceContinuation, { status: 'claim_ready' }>): SameDeviceClaimResume {
  return {
    status: 'claim_ready',
    resolvedOffer: continuation.resolvedOffer,
    authorizationCodeExchange: {
      authorizationCode: continuation.authorizationExchange.authorizationCode,
      codeVerifier: continuation.authorizationExchange.codeVerifier,
      redirectUri: continuation.authorizationExchange.redirectUri,
      clientId: continuation.authorizationExchange.clientId,
      tokenEndpoint: continuation.authorizationExchange.tokenEndpoint,
    },
  }
}

/** Resume claim when a same-device session already has authorization code + resolved offer. */
export async function resumeSameDeviceClaimFromSession(): Promise<SameDeviceClaimResume> {
  const session = readActiveSameDeviceSession()
  if (!session) {
    return { status: 'no_session' }
  }

  if (session.phase === 'claim' && session.resolvedOffer && session.authorizationExchange) {
    return {
      status: 'claim_ready',
      resolvedOffer: session.resolvedOffer,
      authorizationCodeExchange: {
        authorizationCode: session.authorizationExchange.authorizationCode,
        codeVerifier: session.authorizationExchange.codeVerifier,
        redirectUri: session.authorizationExchange.redirectUri,
        clientId: session.authorizationExchange.clientId,
        tokenEndpoint: session.authorizationExchange.tokenEndpoint,
      },
    }
  }

  if (session.phase === 'awaiting_pid_vp') {
    return { status: 'awaiting_pid_vp' }
  }

  const continuation = await continueSameDeviceIssuanceAfterPortal()
  if (continuation.status === 'awaiting_pid_vp') {
    return { status: 'awaiting_pid_vp' }
  }
  if (continuation.status === 'claim_ready') {
    return toClaimReady(continuation)
  }
  return { status: 'no_session' }
}

/** Call after same-device PID VP completes for DL/Transcript auth-code issuance. */
export async function resumeSameDeviceClaimAfterPidVp(): Promise<SameDeviceClaimResume> {
  const continuation = await prepareSameDeviceClaimAfterPidVp()
  if (continuation.status === 'claim_ready') {
    return toClaimReady(continuation)
  }
  if (continuation.status === 'awaiting_pid_vp') {
    return { status: 'awaiting_pid_vp' }
  }
  return { status: 'no_session' }
}
