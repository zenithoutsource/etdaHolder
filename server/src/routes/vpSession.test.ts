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
})
