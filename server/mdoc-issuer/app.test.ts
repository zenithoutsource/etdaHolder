import request from 'supertest'

import { createMdocIssuerApp, DEFAULT_CREDENTIAL_CONFIGURATION_ID, DEFAULT_DOCTYPE } from './app'

describe('mdoc issuer app', () => {
  it('exposes issuer and authorization metadata', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const issuerMetadata = await request(app).get('/.well-known/openid-credential-issuer')
    const authMetadata = await request(app).get('/.well-known/oauth-authorization-server')

    expect(issuerMetadata.status).toBe(200)
    expect(issuerMetadata.body.credential_issuer).toBe('http://127.0.0.1:4100')
    expect(issuerMetadata.body.credential_endpoint).toBe('http://127.0.0.1:4100/credential')
    expect(issuerMetadata.body.credential_configurations_supported[DEFAULT_CREDENTIAL_CONFIGURATION_ID]).toMatchObject({
      format: 'mso_mdoc',
      doctype: DEFAULT_DOCTYPE,
    })

    expect(authMetadata.status).toBe(200)
    expect(authMetadata.body.token_endpoint).toBe('http://127.0.0.1:4100/token')
    expect(authMetadata.body.grant_types_supported).toContain('urn:ietf:params:oauth:grant-type:pre-authorized_code')
  })

  it('creates an offer, exchanges a pre-authorized code, and returns an mdoc credential', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const offer = await request(app)
      .post('/offers')
      .send({ credentialConfigurationId: DEFAULT_CREDENTIAL_CONFIGURATION_ID })

    expect(offer.status).toBe(201)
    expect(offer.body.offerUri).toContain('openid-credential-offer://')
    expect(offer.body.preAuthorizedCode).toEqual(expect.any(String))

    const token = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': offer.body.preAuthorizedCode,
      })

    expect(token.status).toBe(200)
    expect(token.body.token_type).toBe('Bearer')
    expect(token.body.access_token).toEqual(expect.any(String))
    expect(token.body.c_nonce).toEqual(expect.any(String))

    const credential = await request(app)
      .post('/credential')
      .set('Authorization', `Bearer ${token.body.access_token}`)
      .send({
        format: 'mso_mdoc',
        doctype: DEFAULT_DOCTYPE,
      })

    expect(credential.status).toBe(200)
    expect(credential.body.format).toBe('mso_mdoc')
    expect(credential.body.credential).toEqual(expect.any(String))
    expect(Buffer.from(credential.body.credential, 'base64url').length).toBeGreaterThan(64)
  })

  it('rejects unknown access tokens', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const res = await request(app)
      .post('/credential')
      .set('Authorization', 'Bearer missing-token')
      .send({ format: 'mso_mdoc', doctype: DEFAULT_DOCTYPE })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'invalid_token' })
  })

  it('rejects unsupported credential format with valid token', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const offer = await request(app)
      .post('/offers')
      .send({ credentialConfigurationId: DEFAULT_CREDENTIAL_CONFIGURATION_ID })
    const token = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': offer.body.preAuthorizedCode,
      })

    const res = await request(app)
      .post('/credential')
      .set('Authorization', `Bearer ${token.body.access_token}`)
      .send({ format: 'jwt_vc', doctype: DEFAULT_DOCTYPE })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'unsupported_credential_format' })
  })

  it('rejects unsupported grant type', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'abc' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'unsupported_grant_type' })
  })

  it('rejects invalid pre-authorized code', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'nonexistent-code',
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_grant' })
  })

  it('rejects unsupported credential configuration in offers', async () => {
    const app = createMdocIssuerApp({ issuerBaseUrl: 'http://127.0.0.1:4100' })

    const res = await request(app)
      .post('/offers')
      .send({ credentialConfigurationId: 'unknown_config' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'unsupported_credential_configuration' })
  })
})
