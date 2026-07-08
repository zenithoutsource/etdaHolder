import { randomBytes, randomUUID } from 'node:crypto'

export type VpSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  vpToken: string | null
  consumed: boolean
  credentialType: string
}

const sessions = new Map<string, VpSession>()

export function createVpSession(ttlMs: number): VpSession {
  const session: VpSession = {
    sessionId: randomUUID(),
    nonce: randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    vpToken: null,
    consumed: false,
    credentialType: '',
  }
  sessions.set(session.sessionId, session)
  return session
}

export function getVpSession(sessionId: string): VpSession | undefined {
  return sessions.get(sessionId)
}

function isExpired(session: VpSession): boolean {
  return Date.parse(session.expiresAt) <= Date.now()
}

export function isVpSessionExpired(session: VpSession): boolean {
  return isExpired(session)
}

export function setVpToken(
  sessionId: string,
  vpToken: string,
  credentialType: string,
): 'ok' | 'not-found' | 'expired' | 'already-set' | 'consumed' {
  const session = sessions.get(sessionId)
  if (!session) return 'not-found'
  if (isExpired(session)) return 'expired'
  if (session.consumed) return 'consumed'
  if (session.vpToken !== null) return 'already-set'
  session.vpToken = vpToken
  session.credentialType = credentialType
  return 'ok'
}

export function consumeVpSession(sessionId: string): VpSession | undefined {
  const session = sessions.get(sessionId)
  if (!session || isExpired(session) || session.consumed || !session.vpToken) return undefined
  session.consumed = true
  return session
}

export function resetVpSessionStore(): void {
  sessions.clear()
}
