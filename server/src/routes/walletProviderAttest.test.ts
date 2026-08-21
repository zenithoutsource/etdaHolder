import request from 'supertest'

import { createTestApp } from '../testApp'
import { expireWalletAttestChallengeForTests, expireWalletAttestIdempotencyForTests, readWalletAttestMockSizesForTests, resetWalletAttestMockState } from './walletProviderAttest'

const ORIGINAL_ENV = process.env

const P256_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
}

const ED25519_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
  resetWalletAttestMockState()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

async function issueChallenge(app: ReturnType<typeof createTestApp>) {
  const res = await request(app).post('/wallet-api/wallet-attestations/challenge').send()
  expect(res.status).toBe(201)
  return res.body as { challengeId: string; attestationChallengeBase64: string; expiresAt: string }
}

test('POST /wallet-api/wallet-attestations/challenge returns a challenge', async () => {
  process.env.WALLET_ATTEST_TTL_MS = '600000'
  const app = createTestApp()
  const before = Date.now()
  const body = await issueChallenge(app)

  expect(body.challengeId).toEqual(expect.any(String))
  expect(body.attestationChallengeBase64.length).toBeGreaterThan(0)
  const expiresAtMs = new Date(body.expiresAt).getTime()
  expect(expiresAtMs).toBeGreaterThanOrEqual(before + 600_000 - 5_000)
  expect(expiresAtMs).toBeLessThanOrEqual(before + 600_000 + 5_000)
})

test('POST /wallet-api/wallet-attestations consumes the challenge and returns 201', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)

  const res = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-1',
  })

  expect(res.status).toBe(201)
  expect(res.body.wua).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.$/)
  expect(res.body.wia).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.$/)
})

test('POST /wallet-api/wallet-attestations replays the same idempotency key', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)
  const payload = {
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-replay',
  }

  const first = await request(app).post('/wallet-api/wallet-attestations').send(payload)
  const second = await request(app).post('/wallet-api/wallet-attestations').send(payload)

  expect(first.status).toBe(201)
  expect(second.status).toBe(201)
  expect(second.body).toEqual(first.body)
})

test('POST /wallet-api/wallet-attestations rejects a consumed challenge with a new idempotency key', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)

  await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-1',
  })

  const res = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-2',
  })

  expect(res.status).toBe(400)
})

test('POST /wallet-api/wallet-attestations rejects Ed25519 JWK-only bodies', async () => {
  const app = createTestApp()
  const res = await request(app).post('/wallet-api/wallet-attestations').send({ pubKAttestJwk: ED25519_JWK })
  expect(res.status).toBe(400)
})

test('POST /wallet-api/wallet-attestations rejects unknown challengeId', async () => {
  const app = createTestApp()
  const res = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: 'missing',
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-1',
  })
  expect(res.status).toBe(400)
})

test('POST /wallet-api/wallet-attestations rejects an expired challenge', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)
  expireWalletAttestChallengeForTests(challenge.challengeId)

  const res = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-expired',
  })
  expect(res.status).toBe(400)
})

test('POST /wallet-api/wallet-attestations rejects a missing certificate chain', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)
  const res = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: [],
    submissionIdempotencyKey: 'idem-empty-chain',
  })
  expect(res.status).toBe(400)
})

test('POST /v1/wallet-attestations is not exposed', async () => {
  const app = createTestApp()
  const res = await request(app).post('/v1/wallet-attestations').send({ pubKAttestJwk: P256_JWK })
  expect(res.status).toBe(404)
})

test('POST /wallet-api/wallet-attestations rejects idempotent replay with a different payload', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)
  const first = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-mismatch',
  })
  expect(first.status).toBe(201)

  const second = await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: challenge.challengeId,
    pubKAttestJwk: {
      ...P256_JWK,
      x: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    },
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-mismatch',
  })

  expect(second.status).toBe(400)
  expect(second.body).not.toEqual(first.body)
})

test('wallet attest mock prunes expired challenges and idempotent responses', async () => {
  const app = createTestApp()
  const challenge = await issueChallenge(app)
  expect(readWalletAttestMockSizesForTests().challenges).toBe(1)

  expireWalletAttestChallengeForTests(challenge.challengeId)
  await issueChallenge(app)
  expect(readWalletAttestMockSizesForTests().challenges).toBe(1)

  const live = await issueChallenge(app)
  await request(app).post('/wallet-api/wallet-attestations').send({
    challengeId: live.challengeId,
    pubKAttestJwk: P256_JWK,
    certificateChainDerBase64: ['MAMBAgME'],
    submissionIdempotencyKey: 'idem-prune',
  })
  expect(readWalletAttestMockSizesForTests().idempotentResponses).toBe(1)

  expireWalletAttestIdempotencyForTests('idem-prune')
  await issueChallenge(app)
  expect(readWalletAttestMockSizesForTests().idempotentResponses).toBe(0)
})
