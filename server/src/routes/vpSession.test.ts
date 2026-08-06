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

test('POST /dev/vp-session returns session', async () => {
  const app = createTestApp()
  const res = await request(app).post('/dev/vp-session').send()
  expect(res.status).toBe(201)
  expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(res.body.nonce).toHaveLength(64)
  expect(res.body.expiresAt).toBeTruthy()
})

test('PUT rejects duplicate upload with 409', async () => {
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const id = created.body.sessionId
  await request(app)
    .put(`/dev/vp-session/${id}`)
    .send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })
  const dup = await request(app)
    .put(`/dev/vp-session/${id}`)
    .send({ vpToken: 'vp2~kb', credentialType: 'ThaiNationalID' })
  expect(dup.status).toBe(409)
})

test('GET /dev/vp-verify returns 202 when vp not uploaded', async () => {
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const res = await request(app).get(`/dev/vp-verify?s=${created.body.sessionId}`)
  expect(res.status).toBe(202)
  expect(res.headers['retry-after']).toBe('2')
  expect(res.headers['content-type']).toMatch(/text\/html; charset=utf-8/i)
  expect(res.text).toContain('รอ Wallet')
})

test('GET /dev/vp-verify returns 410 expired HTML after TTL elapses', async () => {
  jest.useFakeTimers({ now: new Date('2026-07-09T10:00:00.000Z') })
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const sessionId = created.body.sessionId as string
  await request(app)
    .put(`/dev/vp-session/${sessionId}`)
    .send({ vpToken: 'issuer.jwt~disclosure~kb.jwt', credentialType: 'ThaiNationalID' })

  jest.advanceTimersByTime(301_000)

  const res = await request(app).get(`/dev/vp-verify?s=${sessionId}`)
  expect(res.status).toBe(410)
  expect(res.headers['content-type']).toMatch(/text\/html; charset=utf-8/i)
  expect(res.text).toContain('QR หมดอายุ')
  expect(res.text).not.toContain('ยืนยันแล้ว')
  jest.useRealTimers()
})

test('GET /dev/vp-session/:id/status reports expired after TTL', async () => {
  jest.useFakeTimers({ now: new Date('2026-07-09T10:00:00.000Z') })
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const sessionId = created.body.sessionId as string
  await request(app)
    .put(`/dev/vp-session/${sessionId}`)
    .send({ vpToken: 'issuer.jwt~disclosure~kb.jwt', credentialType: 'ThaiNationalID' })

  jest.advanceTimersByTime(301_000)

  const res = await request(app).get(`/dev/vp-session/${sessionId}/status`)
  expect(res.status).toBe(200)
  expect(res.body.status).toBe('expired')
  jest.useRealTimers()
})

test('GET /dev/vp-session/:id/status reports ready after upload', async () => {
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const id = created.body.sessionId
  await request(app)
    .put(`/dev/vp-session/${id}`)
    .send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })

  const res = await request(app).get(`/dev/vp-session/${id}/status`)
  expect(res.status).toBe(200)
  expect(res.body.status).toBe('ready')
})

test('GET /dev/vp-session/:id/status returns verify_failed with reason after failed verify', async () => {
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const id = created.body.sessionId as string
  await request(app)
    .put(`/dev/vp-session/${id}`)
    .send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })

  await request(app).get(`/dev/vp-verify?s=${id}`)

  const res = await request(app).get(`/dev/vp-session/${id}/status`)
  expect(res.status).toBe(200)
  expect(res.body.status).toBe('verify_failed')
  expect(res.body.reason).toEqual(expect.any(String))
})
