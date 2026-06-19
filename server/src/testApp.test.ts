import request from 'supertest'

import { createTestApp } from './testApp'

const ORIGINAL_ENV = process.env

describe('test app security middleware', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

  test('forwards enabled development issuer proxy requests through the host machine', async () => {
    process.env.ENABLE_DEV_ISSUER_PROXY = 'true'
    process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ credential_issuer: 'https://issuer.office.example' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const app = createTestApp()

    const response = await request(app)
      .get('/dev-issuer-proxy/.well-known/openid-credential-issuer')
      .set('Accept', 'application/json')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ credential_issuer: 'https://issuer.office.example' })
    expect(fetchMock).toHaveBeenCalledWith('https://issuer.office.example/.well-known/openid-credential-issuer', {
      method: 'GET',
      headers: expect.any(Headers),
      body: undefined,
    })
  })

  test('forwards enabled development verifier proxy requests through the host machine', async () => {
    process.env.ENABLE_DEV_VERIFIER_PROXY = 'true'
    process.env.VERIFIER_PROXY_TARGET = 'http://192.100.10.48'
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('request.jwt', {
        status: 200,
        headers: { 'content-type': 'application/oauth-authz-req+jwt' },
      }),
    )
    const app = createTestApp()

    const response = await request(app)
      .get('/dev-verifier-proxy/openid4vc/request/request-1')
      .set('Accept', 'application/oauth-authz-req+jwt')

    expect(response.status).toBe(200)
    expect(response.text).toBe('request.jwt')
    expect(fetchMock).toHaveBeenCalledWith('http://192.100.10.48/openid4vc/request/request-1', {
      method: 'GET',
      headers: expect.any(Headers),
      body: undefined,
    })
  })
})
