import { randomBytes, randomUUID } from 'node:crypto'

export type VerificationOutcome = 'pending' | 'verified' | 'verify_failed'

export type PresentationSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  vpToken: string | null
  consumed: boolean
  credentialType: string
  verificationOutcome: VerificationOutcome
  verificationReason?: string
}

export type PresentationSessionStatus =
  | 'pending'
  | 'ready'
  | 'verified'
  | 'verify_failed'
  | 'expired'

export type SetVpTokenOutcome = 'ok' | 'not-found' | 'expired' | 'already-set' | 'consumed'

export type FinalizeVerificationOutcome =
  | 'ok'
  | 'not-found'
  | 'expired'
  | 'no-vp'
  | 'already-finalized'

export type FinalizeVerificationInput =
  | { outcome: 'verified' }
  | { outcome: 'verify_failed'; reason: string }

export interface PresentationSessionStore {
  createSession(ttlMs: number): PresentationSession
  getSession(sessionId: string): PresentationSession | undefined
  isExpired(session: PresentationSession): boolean
  resolveStatus(sessionId: string): PresentationSessionStatus | 'not-found'
  setVpToken(sessionId: string, vpToken: string, credentialType: string): SetVpTokenOutcome
  finalizeVerification(sessionId: string, input: FinalizeVerificationInput): FinalizeVerificationOutcome
  consumeSession(sessionId: string): PresentationSession | undefined
  reset(): void
}

function isExpiredAt(expiresAt: string): boolean {
  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return true
  return expiresAtMs <= Date.now()
}

function isTerminalOutcome(outcome: VerificationOutcome): boolean {
  return outcome === 'verified' || outcome === 'verify_failed'
}

export function createInMemoryPresentationSessionStore(): PresentationSessionStore {
  const sessions = new Map<string, PresentationSession>()

  return {
    createSession(ttlMs: number): PresentationSession {
      const session: PresentationSession = {
        sessionId: randomUUID(),
        nonce: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        vpToken: null,
        consumed: false,
        credentialType: '',
        verificationOutcome: 'pending',
      }
      sessions.set(session.sessionId, session)
      return session
    },

    getSession(sessionId: string): PresentationSession | undefined {
      return sessions.get(sessionId)
    },

    isExpired(session: PresentationSession): boolean {
      return isExpiredAt(session.expiresAt)
    },

    resolveStatus(sessionId: string): PresentationSessionStatus | 'not-found' {
      const session = sessions.get(sessionId)
      if (!session) return 'not-found'
      if (session.verificationOutcome === 'verified') return 'verified'
      if (session.verificationOutcome === 'verify_failed') return 'verify_failed'
      if (isExpiredAt(session.expiresAt)) return 'expired'
      if (!session.vpToken) return 'pending'
      return 'ready'
    },

    setVpToken(sessionId: string, vpToken: string, credentialType: string): SetVpTokenOutcome {
      const session = sessions.get(sessionId)
      if (!session) return 'not-found'
      if (isExpiredAt(session.expiresAt)) return 'expired'
      if (session.consumed || isTerminalOutcome(session.verificationOutcome)) return 'consumed'
      if (session.vpToken !== null) return 'already-set'
      session.vpToken = vpToken
      session.credentialType = credentialType
      return 'ok'
    },

    finalizeVerification(sessionId: string, input: FinalizeVerificationInput): FinalizeVerificationOutcome {
      const session = sessions.get(sessionId)
      if (!session) return 'not-found'
      if (isExpiredAt(session.expiresAt)) return 'expired'
      if (!session.vpToken) return 'no-vp'
      if (isTerminalOutcome(session.verificationOutcome)) return 'already-finalized'

      session.verificationOutcome = input.outcome
      session.consumed = true
      if (input.outcome === 'verify_failed') {
        session.verificationReason = input.reason
      }
      return 'ok'
    },

    consumeSession(sessionId: string): PresentationSession | undefined {
      const outcome = this.finalizeVerification(sessionId, { outcome: 'verified' })
      if (outcome !== 'ok' && outcome !== 'already-finalized') return undefined
      return sessions.get(sessionId)
    },

    reset(): void {
      sessions.clear()
    },
  }
}

const defaultStore = createInMemoryPresentationSessionStore()

export function getDefaultPresentationSessionStore(): PresentationSessionStore {
  return defaultStore
}
