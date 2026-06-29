import request from 'supertest'

import { isParseableCredentialOfferUri } from './services/devRenewalOffer'
import { resetDevWalletState } from './routes/devWallet'
import { createTestApp } from './testApp'

const ORIGINAL_ENV = process.env

describe('test app security middleware', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    jest.restoreAllMocks()
    resetDevWalletState()
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

  test('stores and returns development issuer suspension records', async () => {
    const app = createTestApp()

    const created = await request(app).post('/wallet-api/dev/issuer/suspend').send({
      credentialId: 'transcript-1',
      suspendedAt: '2026-06-25T10:00:00.000Z',
      reasonCode: 'issuer-review',
      issuerRef: 'issuer-1',
      updatedAt: '2026-06-25T10:05:00.000Z',
    })
    const status = await request(app).get('/wallet-api/dev/wallet/suspension-status')

    expect(created.status).toBe(201)
    expect(status.status).toBe(200)
    expect(status.body).toEqual({
      suspensions: [
        {
          credentialId: 'transcript-1',
          suspendedAt: '2026-06-25T10:00:00.000Z',
          reasonCode: 'issuer-review',
          issuerRef: 'issuer-1',
          updatedAt: '2026-06-25T10:05:00.000Z',
        },
      ],
    })
  })

  test('registers a push token and delivers a mapped credential-event push through Expo', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ status: 'ok', id: 'ticket-1' }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )
    const app = createTestApp()

    const registered = await request(app).post('/wallet-api/wallet/push-token').send({
      token: 'ExponentPushToken[device-1]',
      holderDid: 'did:key:zHolder',
    })
    const delivered = await request(app).post('/wallet-api/dev/webhook/credential-event').send({
      event: 'renewal-ready',
      holderDid: 'did:key:zHolder',
      credentialId: 'cred-1',
      credentialType: 'ThaiNationalID',
    })

    expect(registered.status).toBe(200)
    expect(registered.body).toEqual({ ok: true })
    expect(delivered.status).toBe(200)
    expect(delivered.body).toEqual({ delivered: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'ExponentPushToken[device-1]',
          title: 'เอกสารใหม่พร้อมแล้ว',
          body: 'Thai National ID ออกใหม่ให้คุณแล้ว แตะเพื่อรับ',
          data: {
            event: 'renewal-ready',
            credentialId: 'cred-1',
            credentialType: 'ThaiNationalID',
          },
          sound: 'default',
          priority: 'high',
        }),
      }),
    )
  })

  test('renewal-request accepts without returning offer; status transitions to offer-ready', async () => {
    process.env.DEV_RENEWAL_DELAY_MS = '0'
    process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
    const issuerOfferUri =
      'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.office.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Drenewal-1'
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/credential-offer')) {
        return new Response(JSON.stringify({ offerUri: issuerOfferUri }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    const app = createTestApp()

    const created = await request(app).post('/wallet-api/dev/wallet/renewal-request').send({
      credentialId: 'thai-id-1',
      credentialType: 'ThaiNationalID',
      oldHolderDid: 'did:key:old',
      newHolderDid: 'did:key:new',
      rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
    })

    expect(fetchMock).toHaveBeenCalledWith('https://issuer.office.example/credential-offer', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_type: 'IdCard' }),
    })
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ accepted: true })

    const statusReady = await request(app).get('/wallet-api/dev/wallet/renewal-status')
    expect(statusReady.status).toBe(200)
    expect(statusReady.body.renewals[0].state).toBe('offer-ready')
    expect(statusReady.body.renewals[0].offerUri).toBe(issuerOfferUri)
    expect(isParseableCredentialOfferUri(statusReady.body.renewals[0].offerUri)).toBe(true)

    fetchMock.mockRestore()
  })

  test('renewal-status stays requested until DEV_RENEWAL_DELAY_MS elapses', async () => {
    process.env.DEV_RENEWAL_DELAY_MS = '60000'
    process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
    const issuerOfferUri =
      'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.office.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Drenewal-2'
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/credential-offer')) {
        return new Response(JSON.stringify({ offerUri: issuerOfferUri }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    const app = createTestApp()

    await request(app).post('/wallet-api/dev/wallet/renewal-request').send({
      credentialId: 'thai-id-2',
      credentialType: 'ThaiNationalID',
      oldHolderDid: 'did:key:old',
      newHolderDid: 'did:key:new',
      rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
    })

    const statusRequested = await request(app).get('/wallet-api/dev/wallet/renewal-status')
    expect(statusRequested.body.renewals[0].state).toBe('requested')
    expect(statusRequested.body.renewals[0].offerUri).toBeUndefined()
  })
})
