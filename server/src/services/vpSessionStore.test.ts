import {
  consumeVpSession,
  createVpSession,
  getVpSession,
  resetVpSessionStore,
  setVpToken,
} from './vpSessionStore'

beforeEach(() => resetVpSessionStore())

test('createVpSession returns uuid session with 64-char hex nonce', () => {
  const session = createVpSession(60_000)
  expect(session.vpToken).toBeNull()
  expect(session.consumed).toBe(false)
  expect(session.nonce).toMatch(/^[0-9a-f]{64}$/)
  expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now())
  expect(getVpSession(session.sessionId)).toEqual(session)
})

test('setVpToken rejects second upload with already-set', () => {
  const session = createVpSession(60_000)
  expect(setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('ok')
  expect(setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('already-set')
})

test('setVpToken rejects after consumed', () => {
  const session = createVpSession(60_000)
  setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  consumeVpSession(session.sessionId)
  expect(setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('consumed')
})

test('setVpToken rejects expired session', () => {
  const session = createVpSession(-1_000)
  expect(setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('expired')
})
