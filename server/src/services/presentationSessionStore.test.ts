import {
  createInMemoryPresentationSessionStore,
  type PresentationSessionStore,
} from './presentationSessionStore'

let store: PresentationSessionStore

beforeEach(() => {
  store = createInMemoryPresentationSessionStore()
})

test('createSession returns uuid session with 64-char hex nonce', () => {
  const session = store.createSession(60_000)
  expect(session.vpToken).toBeNull()
  expect(session.consumed).toBe(false)
  expect(session.verificationOutcome).toBe('pending')
  expect(session.nonce).toMatch(/^[0-9a-f]{64}$/)
  expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now())
  expect(store.getSession(session.sessionId)).toEqual(session)
})

test('setVpToken rejects second upload with already-set', () => {
  const session = store.createSession(60_000)
  expect(store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('ok')
  expect(store.setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('already-set')
})

test('setVpToken rejects after finalized', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  store.finalizeVerification(session.sessionId, { outcome: 'verified' })
  expect(store.setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('consumed')
})

test('setVpToken rejects expired session', () => {
  const session = store.createSession(-1_000)
  expect(store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('expired')
})

test('resolveStatus reports ready then verified and expired', () => {
  const session = store.createSession(60_000)
  expect(store.resolveStatus(session.sessionId)).toBe('pending')
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  expect(store.resolveStatus(session.sessionId)).toBe('ready')
  store.finalizeVerification(session.sessionId, { outcome: 'verified' })
  expect(store.resolveStatus(session.sessionId)).toBe('verified')

  const expired = store.createSession(-1_000)
  expect(store.resolveStatus(expired.sessionId)).toBe('expired')
})

test('finalizeVerification sets verified status', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  expect(store.finalizeVerification(session.sessionId, { outcome: 'verified' })).toBe('ok')
  expect(store.resolveStatus(session.sessionId)).toBe('verified')
})

test('finalizeVerification sets verify_failed status with reason', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  expect(
    store.finalizeVerification(session.sessionId, {
      outcome: 'verify_failed',
      reason: 'kb-nonce-mismatch',
    }),
  ).toBe('ok')
  expect(store.resolveStatus(session.sessionId)).toBe('verify_failed')
  expect(store.getSession(session.sessionId)?.verificationReason).toBe('kb-nonce-mismatch')
})

test('finalizeVerification is idempotent', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  store.finalizeVerification(session.sessionId, { outcome: 'verified' })
  expect(store.finalizeVerification(session.sessionId, { outcome: 'verify_failed', reason: 'x' })).toBe(
    'already-finalized',
  )
  expect(store.resolveStatus(session.sessionId)).toBe('verified')
})

test('resolveStatus returns verify_failed before expired when outcome set', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  store.finalizeVerification(session.sessionId, { outcome: 'verify_failed', reason: 'issuer-signature-invalid' })
  session.expiresAt = new Date(Date.now() - 1_000).toISOString()
  expect(store.resolveStatus(session.sessionId)).toBe('verify_failed')
})

test('isExpired is true when expiresAt is in the past', () => {
  const session = store.createSession(-1_000)
  expect(store.isExpired(session)).toBe(true)
})

test('isExpired is false for an active session', () => {
  const session = store.createSession(60_000)
  expect(store.isExpired(session)).toBe(false)
})

test('isExpired treats invalid expiresAt as expired', () => {
  const session = store.createSession(60_000)
  session.expiresAt = 'not-a-date'
  expect(store.isExpired(session)).toBe(true)
})

test('resolveStatus returns verified after finalize even when TTL elapsed', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  store.finalizeVerification(session.sessionId, { outcome: 'verified' })
  session.expiresAt = new Date(Date.now() - 1_000).toISOString()
  expect(store.resolveStatus(session.sessionId)).toBe('verified')
})
