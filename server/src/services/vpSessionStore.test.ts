import {
  consumeVpSession,
  createVpSession,
  finalizeVpVerification,
  getVpSession,
  isVpSessionExpired,
  resetVpSessionStore,
  resolveVpSessionStatus,
  setVpToken,
} from './vpSessionStore'

beforeEach(() => resetVpSessionStore())

test('createVpSession returns uuid session with 64-char hex nonce', () => {
  const session = createVpSession(60_000)
  expect(session.vpToken).toBeNull()
  expect(session.consumed).toBe(false)
  expect(session.verificationOutcome).toBe('pending')
  expect(session.nonce).toMatch(/^[0-9a-f]{64}$/)
  expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now())
  expect(getVpSession(session.sessionId)).toEqual(session)
})

test('setVpToken rejects second upload with already-set', () => {
  const session = createVpSession(60_000)
  expect(setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('ok')
  expect(setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('already-set')
})

test('setVpToken rejects after finalized', () => {
  const session = createVpSession(60_000)
  setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  finalizeVpVerification(session.sessionId, { outcome: 'verified' })
  expect(setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('consumed')
})

test('setVpToken rejects expired session', () => {
  const session = createVpSession(-1_000)
  expect(setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('expired')
})

test('resolveVpSessionStatus reports ready then verified and expired', () => {
  const session = createVpSession(60_000)
  expect(resolveVpSessionStatus(session.sessionId)).toBe('pending')
  setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  expect(resolveVpSessionStatus(session.sessionId)).toBe('ready')
  consumeVpSession(session.sessionId)
  expect(resolveVpSessionStatus(session.sessionId)).toBe('verified')

  const expired = createVpSession(-1_000)
  expect(resolveVpSessionStatus(expired.sessionId)).toBe('expired')
})

test('isVpSessionExpired is true when expiresAt is in the past', () => {
  const session = createVpSession(-1_000)
  expect(isVpSessionExpired(session)).toBe(true)
})

test('isVpSessionExpired is false for an active session', () => {
  const session = createVpSession(60_000)
  expect(isVpSessionExpired(session)).toBe(false)
})

test('isVpSessionExpired treats invalid expiresAt as expired', () => {
  const session = createVpSession(60_000)
  session.expiresAt = 'not-a-date'
  expect(isVpSessionExpired(session)).toBe(true)
})

test('resolveVpSessionStatus returns verified after finalize even when TTL elapsed', () => {
  const session = createVpSession(60_000)
  setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  finalizeVpVerification(session.sessionId, { outcome: 'verified' })
  session.expiresAt = new Date(Date.now() - 1_000).toISOString()
  expect(resolveVpSessionStatus(session.sessionId)).toBe('verified')
})
