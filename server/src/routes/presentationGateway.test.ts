import request from 'supertest'

import { createTestApp } from '../testApp'
import { resetVpSessionStore } from '../services/vpSessionStore'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
  resetVpSessionStore()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

test('POST /v1/presentation-sessions returns session with verifyUrl', async () => {
  const app = createTestApp()
  const res = await request(app).post('/v1/presentation-sessions').send()
  expect(res.status).toBe(201)
  expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(res.body.nonce).toHaveLength(64)
  expect(res.body.expiresAt).toBeTruthy()
  expect(res.body.verifyUrl).toContain('/v1/present/verify?s=')
})

test('PUT rejects non-ThaiNationalID with 400', async () => {
  const app = createTestApp()
  const created = await request(app).post('/v1/presentation-sessions').send()
  const res = await request(app)
    .put(`/v1/presentation-sessions/${created.body.sessionId}`)
    .send({ vpToken: 'vp~kb', credentialType: 'DrivingLicence' })
  expect(res.status).toBe(400)
})

test('PUT rejects duplicate upload with 409', async () => {
  const app = createTestApp()
  const created = await request(app).post('/v1/presentation-sessions').send()
  const id = created.body.sessionId
  await request(app)
    .put(`/v1/presentation-sessions/${id}`)
    .send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })
  const dup = await request(app)
    .put(`/v1/presentation-sessions/${id}`)
    .send({ vpToken: 'vp2~kb', credentialType: 'ThaiNationalID' })
  expect(dup.status).toBe(409)
})

test('GET /v1/present/verify returns 202 when vp not uploaded', async () => {
  const app = createTestApp()
  const created = await request(app).post('/v1/presentation-sessions').send()
  const res = await request(app).get(`/v1/present/verify?s=${created.body.sessionId}`)
  expect(res.status).toBe(202)
  expect(res.headers['retry-after']).toBe('2')
  expect(res.headers['content-type']).toMatch(/text\/html; charset=utf-8/i)
  expect(res.text).toContain('รอ Wallet')
})

test('GET /v1/presentation-sessions/:id/status reports ready after upload', async () => {
  const app = createTestApp()
  const created = await request(app).post('/v1/presentation-sessions').send()
  const id = created.body.sessionId
  await request(app)
    .put(`/v1/presentation-sessions/${id}`)
    .send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })

  const res = await request(app).get(`/v1/presentation-sessions/${id}/status`)
  expect(res.status).toBe(200)
  expect(res.body.status).toBe('ready')
})

test('GET /v1/presentation-sessions/:id/status returns verify_failed with reason after failed verify', async () => {
  const app = createTestApp()
  const created = await request(app).post('/v1/presentation-sessions').send()
  const id = created.body.sessionId as string
  await request(app)
    .put(`/v1/presentation-sessions/${id}`)
    .send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })

  await request(app).get(`/v1/present/verify?s=${id}`)

  const res = await request(app).get(`/v1/presentation-sessions/${id}/status`)
  expect(res.status).toBe(200)
  expect(res.body.status).toBe('verify_failed')
  expect(res.body.reason).toEqual(expect.any(String))
})
