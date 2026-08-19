import request from 'supertest'

import { createTestApp } from '../testApp'

const ORIGINAL_ENV = process.env

function useSyntheticProductionEnv(): void {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'production',
    PORT: '4000',
    WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example.invalid',
    DB_HOST: 'db.example.invalid',
    DB_PORT: '3306',
    DB_NAME: 'wallet',
    DB_USER: 'wallet',
    DB_PASSWORD: 'synthetic-password',
    JWT_SECRET: 'synthetic-production-jwt-secret',
    MAIL_FROM: 'wallet@example.invalid',
    PUBLIC_BASE_URL: 'https://wallet.example.invalid',
    VERIFIER_PRESENTATION_BASE_URL: 'https://verifier.example.invalid',
  }
  delete process.env.ENABLE_DEVELOPMENT_APIS
}

const expectedDevOperations = [
  'GET /wallet-api/dev/wallet/suspension-status',
  'GET /wallet-api/dev/wallet/renewal-status',
  'POST /wallet-api/dev/presentation/suspend-access',
  'POST /wallet-api/dev/issuer/suspend',
  'POST /wallet-api/dev/wallet/mark-used',
  'GET /wallet-api/dev/wallet/used-status',
  'POST /wallet-api/dev/issuer/holder-revoke/nonce',
  'POST /wallet-api/dev/issuer/holder-revoke',
  'GET /wallet-api/dev/wallet/revoke-status',
  'POST /wallet-api/dev/webhook/credential-event',
  'POST /wallet-api/dev/wallet/renewal-request',
  'POST /wallet-api/dev/wallet/renewal-vp/response',
] as const

function collectDocumentOperations(document: { paths: Record<string, Record<string, unknown>> }): string[] {
  const operations: string[] = []
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      if (pathItem[method]) {
        operations.push(`${method.toUpperCase()} ${path}`)
      }
    }
  }
  return operations.sort()
}

describe('Development Swagger routes', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  test('serves Swagger UI and OpenAPI JSON in non-production', async () => {
    const html = await request(createTestApp()).get('/wallet-api/dev/docs/')
    expect(html.status).toBe(200)
    expect(html.type).toBe('text/html')
    expect(html.text).toContain('<title>Development API</title>')

    const localAlias = await request(createTestApp()).get('/dev/docs/')
    expect(localAlias.status).toBe(200)
    expect(localAlias.text).toContain('<title>Development API</title>')

    const json = await request(createTestApp()).get('/wallet-api/dev/openapi.json')
    expect(json.status).toBe(200)
    expect(collectDocumentOperations(json.body)).toEqual([...expectedDevOperations].sort())

    const localJson = await request(createTestApp()).get('/dev/openapi.json')
    expect(localJson.status).toBe(200)
    expect(collectDocumentOperations(localJson.body)).toEqual([...expectedDevOperations].sort())

    const documentedPaths = Object.keys(json.body.paths as Record<string, unknown>)
    expect(documentedPaths.some((path) => path.startsWith('/v1/'))).toBe(false)
    expect(documentedPaths.some((path) => path.startsWith('/wallet-api/auth/'))).toBe(false)
    expect(
      documentedPaths.some(
        (path) =>
          path.startsWith('/wallet-api/wallet/') && !path.startsWith('/wallet-api/dev/'),
      ),
    ).toBe(false)
  })

  test('does not serve Development documentation in production', async () => {
    useSyntheticProductionEnv()
    const app = createTestApp()

    const devDocs = await request(app).get('/dev/docs/')
    const proxiedDevDocs = await request(app).get('/wallet-api/dev/docs/')
    const devOpenApi = await request(app).get('/dev/openapi.json')
    const proxiedDevOpenApi = await request(app).get('/wallet-api/dev/openapi.json')
    const walletOpenApi = await request(app).get('/wallet-api/openapi.json')
    const removedGateway = await request(app).get('/v1/openapi.json')

    expect(devDocs.status).toBe(404)
    expect(proxiedDevDocs.status).toBe(404)
    expect(devOpenApi.status).toBe(404)
    expect(proxiedDevOpenApi.status).toBe(404)
    expect(walletOpenApi.status).toBe(200)
    expect(removedGateway.status).toBe(404)
  })

  test('serves Development documentation in production when ENABLE_DEVELOPMENT_APIS=true', async () => {
    useSyntheticProductionEnv()
    process.env.ENABLE_DEVELOPMENT_APIS = 'true'
    const app = createTestApp()

    const proxiedDevDocs = await request(app).get('/wallet-api/dev/docs/')
    const proxiedDevOpenApi = await request(app).get('/wallet-api/dev/openapi.json')

    expect(proxiedDevDocs.status).toBe(200)
    expect(proxiedDevOpenApi.status).toBe(200)
    expect(collectDocumentOperations(proxiedDevOpenApi.body)).toEqual(
      [...expectedDevOperations].sort(),
    )
  })
})
