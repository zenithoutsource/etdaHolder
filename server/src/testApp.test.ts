import request from 'supertest'

import { createTestApp } from './testApp'

const ORIGINAL_ENV = process.env

describe('test app security middleware', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('restricts CORS to configured development origins', async () => {
    process.env.WALLET_API_ALLOWED_ORIGINS = 'http://localhost:19006,http://192.168.1.10:8081'
    const app = createTestApp()

    const allowed = await request(app)
      .options('/wallet-api/auth/login')
      .set('Origin', 'http://localhost:19006')
      .set('Access-Control-Request-Method', 'POST')
    const disallowed = await request(app)
      .options('/wallet-api/auth/login')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST')

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:19006')
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined()
  })

  test('rate limits repeated auth attempts', async () => {
    const app = createTestApp()

    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await request(app).post('/wallet-api/auth/login').send({})
      expect(response.status).toBe(400)
    }

    const blocked = await request(app).post('/wallet-api/auth/login').send({})

    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ message: 'Too Many Requests' })
  })
})
