// Not used on portal offer-URI path — see docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md
import type { IssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import { readIssuerPortalReturnUrl } from '../../config/issuerPortalUrls'
import { sameDeviceIssuanceRequiresPidVp } from '../../config/sameDeviceIssuance'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { generatePkcePair } from './pkce'
import {
  type SameDeviceIssuanceSession,
  useSameDeviceIssuanceStore,
} from '../../store/sameDeviceIssuanceStore'

function createSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function beginSameDeviceIssuanceSession(
  credentialType: IssuerPortalCredentialType,
): SameDeviceIssuanceSession {
  const { codeVerifier } = generatePkcePair()
  const session: SameDeviceIssuanceSession = {
    id: createSessionId(),
    credentialType,
    phase: 'portal',
    codeVerifier,
    redirectUri: readIssuerPortalReturnUrl(),
  }
  useSameDeviceIssuanceStore.getState().setSession(session)
  logWalletStep('same-device-issuance', 'session-start', {
    credentialType,
    sessionId: session.id,
  })
  return session
}

export function storeSameDeviceAuthorizationCode(authorizationCode: string): SameDeviceIssuanceSession | null {
  const store = useSameDeviceIssuanceStore.getState()
  const session = store.session
  if (!session) {
    logWalletError('same-device-issuance', 'authorization-code-without-session', new Error('missing session'))
    return null
  }

  const nextPhase = sameDeviceIssuanceRequiresPidVp(session.credentialType)
    ? 'awaiting_pid_vp'
    : 'claim'

  store.patchSession({
    authorizationCode,
    phase: nextPhase,
  })

  logWalletStep('same-device-issuance', 'authorization-code-stored', {
    sessionId: session.id,
    credentialType: session.credentialType,
    nextPhase,
  })

  return useSameDeviceIssuanceStore.getState().session
}

export function clearSameDeviceIssuanceSession(): void {
  useSameDeviceIssuanceStore.getState().clearSession()
}
