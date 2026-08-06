import {
  createInMemoryPresentationSessionStore,
  getDefaultPresentationSessionStore,
  type FinalizeVerificationInput,
  type FinalizeVerificationOutcome,
  type PresentationSession,
  type PresentationSessionStatus,
  type SetVpTokenOutcome,
} from './presentationSessionStore'

export type VpSession = PresentationSession
export type VpSessionStatus = PresentationSessionStatus

const store = getDefaultPresentationSessionStore()

export function createVpSession(ttlMs: number): VpSession {
  return store.createSession(ttlMs)
}

export function getVpSession(sessionId: string): VpSession | undefined {
  return store.getSession(sessionId)
}

export function isVpSessionExpired(session: VpSession): boolean {
  return store.isExpired(session)
}

export function resolveVpSessionStatus(sessionId: string): VpSessionStatus | 'not-found' {
  return store.resolveStatus(sessionId)
}

export function setVpToken(
  sessionId: string,
  vpToken: string,
  credentialType: string,
): SetVpTokenOutcome {
  return store.setVpToken(sessionId, vpToken, credentialType)
}

export function finalizeVpVerification(
  sessionId: string,
  input: FinalizeVerificationInput,
): FinalizeVerificationOutcome {
  return store.finalizeVerification(sessionId, input)
}

export function consumeVpSession(sessionId: string): VpSession | undefined {
  return store.consumeSession(sessionId)
}

export function resetVpSessionStore(): void {
  store.reset()
}

export { createInMemoryPresentationSessionStore }
