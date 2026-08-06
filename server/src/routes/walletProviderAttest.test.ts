import request from 'supertest'

import { createTestApp } from '../testApp'

const ORIGINAL_ENV = process.env

const PUB_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

test('POST /wallet-api/wallet-attestations returns 201 with TTL from WALLET_ATTEST_TTL_MS', async () => {
  process.env.WALLET_ATTEST_TTL_MS = '600000'
  const app = createTestApp()
  const before = Date.now()

  const res = await request(app).post('/wallet-api/wallet-attestations').send({ pubKAttestJwk: PUB_JWK })

  expect(res.status).toBe(201)
  expect(res.body.wua).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.$/)
  expect(res.body.wia).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.$/)
  expect(res.body.expiresAt).toBeTruthy()

  const expiresAtMs = new Date(res.body.expiresAt as string).getTime()
  expect(expiresAtMs).toBeGreaterThanOrEqual(before + 600_000 - 5_000)
  expect(expiresAtMs).toBeLessThanOrEqual(before + 600_000 + 5_000)
})

test('POST /wallet-api/wallet-attestations rejects invalid JWK with 400', async () => {
  const app = createTestApp()
  const res = await request(app)
    .post('/wallet-api/wallet-attestations')
    .send({ pubKAttestJwk: { kty: 'RSA' } })
  expect(res.status).toBe(400)
})

test('POST /v1/wallet-attestations is not exposed', async () => {
  const app = createTestApp()
  const res = await request(app).post('/v1/wallet-attestations').send({ pubKAttestJwk: PUB_JWK })
  expect(res.status).toBe(404)
})
