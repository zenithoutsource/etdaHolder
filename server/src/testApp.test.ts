import request from 'supertest'
import { createPublicKey, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto'

import { readNotificationCopy, resetDevWalletState } from './routes/devWallet'
import { isParseableCredentialOfferUri } from './services/devRenewalOffer'
import { createTestApp } from './testApp'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01])

function base58Encode(bytes: Buffer): string {
  let leadingOnes = 0
  for (const byte of bytes) {
    if (byte !== 0) break
    leadingOnes += 1
  }

  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)

  let encoded = ''
  while (value > 0n) {
    const remainder = Number(value % 58n)
    encoded = BASE58_ALPHABET[remainder]! + encoded
    value /= 58n
  }

  return `${'1'.repeat(leadingOnes)}${encoded}`
}

function ed25519PublicJwkToDidKey(publicJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string }): string {
  const der = createPublicKey({ key: publicJwk, format: 'jwk' }).export({ type: 'spki', format: 'der' }) as Buffer
  const rawPublicKey = der.subarray(-32)
  const multicodec = Buffer.concat([ED25519_MULTICODEC_PREFIX, rawPublicKey])
  return `did:key:z${base58Encode(multicodec)}`
}

function signHolderRevokePop(
  input: {
    nonce: string
    audience: string
    credentialId: string
    holderDid: string
    holderKid: string
  },
  privateKey: KeyObject,
): string {
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: 'EdDSA', typ: 'holder-status-change+jwt', kid: input.holderKid }),
  ).toString('base64url')
  const payloadB64 = Buffer.from(
    JSON.stringify({
      iss: input.holderDid,
      sub: input.holderDid,
      aud: input.audience,
      iat: Math.floor(Date.now() / 1000),
      nonce: input.nonce,
      credential_id: input.credentialId,
      action: 'revoke',
    }),
  ).toString('base64url')
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = cryptoSign(null, Buffer.from(signingInput), privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

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

  test('marks development credentials as used', async () => {
    const app = createTestApp()

    const created = await request(app).post('/wallet-api/dev/wallet/mark-used').send({
      credentialId: 'transcript-1',
    })
    const status = await request(app).get('/wallet-api/dev/wallet/used-status?credentialId=transcript-1')

    expect(created.status).toBe(201)
    expect(created.body).toEqual({ used: true, credentialId: 'transcript-1' })
    expect(status.status).toBe(200)
    expect(status.body).toEqual({ used: true, credentialId: 'transcript-1' })
  })

  test('confirms development holder revoke requests with PoP', async () => {
    const app = createTestApp()
    const holderKeys = generateKeyPairSync('ed25519')
    const holderPublicJwk = holderKeys.publicKey.export({ format: 'jwk' }) as {
      kty: 'OKP'
      crv: 'Ed25519'
      x: string
    }
    const holderDid = ed25519PublicJwkToDidKey(holderPublicJwk)
    const holderKid = `${holderDid}#${holderDid.slice('did:key:'.length)}`

    const nonceResponse = await request(app).post('/wallet-api/dev/issuer/holder-revoke/nonce').send({
      credentialId: 'transcript-1',
      holderDid,
    })
    expect(nonceResponse.status).toBe(201)
    const { nonce, audience } = nonceResponse.body as { nonce: string; audience: string }

    const popJwt = signHolderRevokePop(
      {
        nonce,
        audience,
        credentialId: 'transcript-1',
        holderDid,
        holderKid,
      },
      holderKeys.privateKey,
    )

    const created = await request(app).post('/wallet-api/dev/issuer/holder-revoke').send({
      credentialId: 'transcript-1',
      holderDid,
      popJwt,
    })
    const status = await request(app).get('/wallet-api/dev/wallet/revoke-status?credentialId=transcript-1')

    expect(created.status).toBe(201)
    expect(created.body.status).toBe('revoked')
    expect(created.body.credentialId).toBe('transcript-1')
    expect(typeof created.body.confirmedAt).toBe('string')
    expect(status.status).toBe(200)
    expect(status.body.status).toBe('revoked')
  })

  test('rejects holder revoke without PoP', async () => {
    const app = createTestApp()

    const created = await request(app).post('/wallet-api/dev/issuer/holder-revoke').send({
      credentialId: 'transcript-1',
      holderDid: 'did:key:z6Mkholder',
    })

    expect(created.status).toBe(400)
    expect(created.body.message).toContain('popJwt')
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
    const renewalReadyCopy = readNotificationCopy('renewal-ready', 'ThaiNationalID')
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
          ...renewalReadyCopy,
          data: {
            event: 'renewal-ready',
            credentialId: 'cred-1',
            credentialType: 'ThaiNationalID',
          },
          channelId: 'default',
          sound: 'default',
          priority: 'high',
        }),
      }),
    )
  })

  test('renewal-request returns OID4VP auth request; offer-ready only after VP submit', async () => {
    process.env.DEV_RENEWAL_DELAY_MS = '0'
    process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
    process.env.PUBLIC_BASE_URL = 'http://localhost:4000'
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
    expect(created.body.accepted).toBe(true)
    expect(typeof created.body.authorizationRequest).toBe('string')
    expect(created.body.authorizationRequest).toContain('openid4vp://authorize?')
    expect(created.body.authorizationRequest).toContain(
      encodeURIComponent('http://localhost:4000/wallet-api/dev/wallet/renewal-vp/response'),
    )

    const statusBeforeVp = await request(app).get('/wallet-api/dev/wallet/renewal-status')
    expect(statusBeforeVp.body.renewals[0].state).toBe('requested')

    const vpResponse = await request(app)
      .post('/wallet-api/dev/wallet/renewal-vp/response')
      .type('form')
      .send({
        vp_token: 'header.payload.signature',
        state: 'thai-id-1',
      })
    expect(vpResponse.status).toBe(200)
    expect(vpResponse.body).toEqual({ status: 'verified' })

    const statusReady = await request(app).get('/wallet-api/dev/wallet/renewal-status')
    expect(statusReady.status).toBe(200)
    expect(statusReady.body.renewals[0].state).toBe('offer-ready')
    expect(statusReady.body.renewals[0].offerUri).toBe(issuerOfferUri)
    expect(isParseableCredentialOfferUri(statusReady.body.renewals[0].offerUri)).toBe(true)

    fetchMock.mockRestore()
  })

  test('renewal flow sends renewal-required on request and renewal-ready when offer becomes ready', async () => {
    process.env.DEV_RENEWAL_DELAY_MS = '0'
    process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
    const issuerOfferUri =
      'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.office.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Drenewal-3'
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/credential-offer')) {
        return new Response(JSON.stringify({ offerUri: issuerOfferUri }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://exp.host/--/api/v2/push/send') {
        return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch: ${url} ${String(init?.method ?? 'GET')}`)
    })
    const app = createTestApp()

    await request(app).post('/wallet-api/wallet/push-token').send({
      token: 'ExponentPushToken[device-1]',
      holderDid: 'did:key:new',
    })

    const created = await request(app).post('/wallet-api/dev/wallet/renewal-request').send({
      credentialId: 'thai-id-3',
      credentialType: 'ThaiNationalID',
      oldHolderDid: 'did:key:old',
      newHolderDid: 'did:key:new',
      rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
    })

    expect(created.status).toBe(201)

    await request(app)
      .post('/wallet-api/dev/wallet/renewal-vp/response')
      .type('form')
      .send({
        vp_token: 'header.payload.signature',
        state: 'thai-id-3',
      })

    const statusReady = await request(app).get('/wallet-api/dev/wallet/renewal-status')

    expect(statusReady.status).toBe(200)
    expect(statusReady.body.renewals[0].state).toBe('offer-ready')

    const pushBodies = fetchMock.mock.calls
      .filter(([url]) => String(url) === 'https://exp.host/--/api/v2/push/send')
      .map(([, init]) => JSON.parse(String(init?.body)))
    const renewalRequiredCopy = readNotificationCopy('renewal-required', 'ThaiNationalID')
    const renewalReadyCopy = readNotificationCopy('renewal-ready', 'ThaiNationalID')

    expect(pushBodies).toHaveLength(2)
    expect(pushBodies[0]).toEqual({
      to: 'ExponentPushToken[device-1]',
      ...renewalRequiredCopy,
      data: {
        event: 'renewal-required',
        credentialId: 'thai-id-3',
        credentialType: 'ThaiNationalID',
      },
      channelId: 'default',
      sound: 'default',
      priority: 'high',
    })
    expect(pushBodies[1]).toEqual({
      to: 'ExponentPushToken[device-1]',
      ...renewalReadyCopy,
      data: {
        event: 'renewal-ready',
        credentialId: 'thai-id-3',
        credentialType: 'ThaiNationalID',
      },
      channelId: 'default',
      sound: 'default',
      priority: 'high',
    })
  })

  test('renewal flow sends renewal-ready without waiting for client status polling', async () => {
    process.env.DEV_RENEWAL_DELAY_MS = '0'
    process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
    const issuerOfferUri =
      'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.office.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Drenewal-4'
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/credential-offer')) {
        return new Response(JSON.stringify({ offerUri: issuerOfferUri }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://exp.host/--/api/v2/push/send') {
        return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch: ${url} ${String(init?.method ?? 'GET')}`)
    })
    const app = createTestApp()

    await request(app).post('/wallet-api/wallet/push-token').send({
      token: 'ExponentPushToken[device-1]',
      holderDid: 'did:key:new',
    })

    const created = await request(app).post('/wallet-api/dev/wallet/renewal-request').send({
      credentialId: 'thai-id-4',
      credentialType: 'ThaiNationalID',
      oldHolderDid: 'did:key:old',
      newHolderDid: 'did:key:new',
      rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
    })

    expect(created.status).toBe(201)

    await request(app)
      .post('/wallet-api/dev/wallet/renewal-vp/response')
      .type('form')
      .send({
        vp_token: 'header.payload.signature',
        state: 'thai-id-4',
      })

    await new Promise((resolve) => setTimeout(resolve, 25))

    const pushBodies = fetchMock.mock.calls
      .filter(([url]) => String(url) === 'https://exp.host/--/api/v2/push/send')
      .map(([, init]) => JSON.parse(String(init?.body)))

    expect(pushBodies.map((body) => body.data.event)).toEqual([
      'renewal-required',
      'renewal-ready',
    ])
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
