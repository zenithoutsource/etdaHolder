import request from 'supertest'

import { createTestApp } from '../testApp'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

test.each([
  ['POST', '/dev/vp-session'],
  ['PUT', '/dev/vp-session/00000000-0000-4000-8000-000000000001'],
  ['GET', '/dev/vp-session/00000000-0000-4000-8000-000000000001/status'],
  ['GET', '/dev/vp-verify?s=00000000-0000-4000-8000-000000000001'],
  ['POST', '/wallet-api/dev/vp-session'],
])('%s %s is not mounted', async (method, path) => {
  const app = createTestApp()
  const response = await request(app)[method.toLowerCase() as 'get' | 'post' | 'put'](path)
  expect(response.status).toBe(404)
})
