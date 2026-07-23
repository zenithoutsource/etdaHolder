// Not used on portal offer-URI path — see docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md
import {
  readSameDeviceCredentialIssuer,
  readSameDeviceOAuthClientId,
  readSameDeviceTokenUrl,
  resolveCredentialConfigurationIds,
} from '../../config/sameDeviceIssuance'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import {
  resolveAuthorizationCodeIssuance,
  type ResolvedCredentialOffer,
} from '../vci/exchangeService'
import {
  type AuthorizationCodeExchange,
  type SameDeviceIssuanceSession,
  useSameDeviceIssuanceStore,
} from '../../store/sameDeviceIssuanceStore'

export type SameDeviceIssuanceContinuation =
  | { status: 'awaiting_pid_vp'; session: SameDeviceIssuanceSession }
  | { status: 'claim_ready'; session: SameDeviceIssuanceSession; resolvedOffer: ResolvedCredentialOffer; authorizationExchange: AuthorizationCodeExchange }
  | { status: 'no_session' }

export async function continueSameDeviceIssuanceAfterPortal(): Promise<SameDeviceIssuanceContinuation> {
  const session = useSameDeviceIssuanceStore.getState().session
  if (!session?.authorizationCode) {
    return { status: 'no_session' }
  }

  if (session.phase === 'awaiting_pid_vp') {
    return { status: 'awaiting_pid_vp', session }
  }

  return prepareSameDeviceClaim(session)
}

export async function prepareSameDeviceClaimAfterPidVp(): Promise<SameDeviceIssuanceContinuation> {
  const session = useSameDeviceIssuanceStore.getState().session
  if (!session?.authorizationCode) {
    return { status: 'no_session' }
  }

  if (session.phase !== 'awaiting_pid_vp') {
    return { status: 'no_session' }
  }

  useSameDeviceIssuanceStore.getState().patchSession({ phase: 'claim' })
  return prepareSameDeviceClaim(useSameDeviceIssuanceStore.getState().session!)
}

async function prepareSameDeviceClaim(
  session: SameDeviceIssuanceSession,
): Promise<SameDeviceIssuanceContinuation> {
  if (!session.authorizationCode) {
    return { status: 'no_session' }
  }

  try {
    const resolvedOffer = await resolveAuthorizationCodeIssuance({
      issuer: readSameDeviceCredentialIssuer(),
      credentialConfigurationIds: resolveCredentialConfigurationIds(session.credentialType),
    })
    const authorizationExchange: AuthorizationCodeExchange = {
      authorizationCode: session.authorizationCode,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
      clientId: readSameDeviceOAuthClientId(),
      tokenEndpoint: readSameDeviceTokenUrl(),
    }

    useSameDeviceIssuanceStore.getState().patchSession({
      phase: 'claim',
      resolvedOffer,
      authorizationExchange,
    })

    const updated = useSameDeviceIssuanceStore.getState().session!
    logWalletStep('same-device-issuance', 'claim-ready', {
      sessionId: updated.id,
      credentialType: updated.credentialType,
    })

    return {
      status: 'claim_ready',
      session: updated,
      resolvedOffer,
      authorizationExchange,
    }
  } catch (error) {
    logWalletError('same-device-issuance', 'prepare-claim-failed', error, {
      sessionId: session.id,
      credentialType: session.credentialType,
    })
    useSameDeviceIssuanceStore.getState().patchSession({ phase: 'failed' })
    throw error
  }
}

export { clearSameDeviceIssuanceSession } from './sameDeviceIssuanceSession'
