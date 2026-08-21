import request from 'supertest'

import { createTestApp } from '../testApp'

describe('Wallet Swagger routes', () => {
  test('serves Swagger UI HTML', async () => {
    const response = await request(createTestApp()).get('/wallet-api/docs/')

    expect(response.status).toBe(200)
    expect(response.type).toBe('text/html')
    expect(response.text).toContain('<title>Wallet Backend API</title>')
    expect(response.text).toContain('id="swagger-ui"')
  })

  test('serves the OpenAPI JSON document', async () => {
    const response = await request(createTestApp()).get('/wallet-api/openapi.json')

    expect(response.status).toBe(200)
    expect(response.type).toBe('application/json')
    expect(response.body.openapi).toBe('3.0.3')
    expect(response.body.paths).toHaveProperty('/wallet-api/wallet/push-token')
    expect(response.body.paths).toHaveProperty('/wallet-api/wallet-attestations')
    expect(response.body.paths).toHaveProperty('/wallet-api/wallet-attestations/challenge')
  })

  test('keeps the Wallet Swagger UI initialization document scoped to Wallet API', async () => {
    const response = await request(createTestApp()).get('/wallet-api/docs/swagger-ui-init.js')

    expect(response.status).toBe(200)
    expect(response.text).toContain('/wallet-api/auth/login')
    expect(response.text).toContain('/wallet-api/dev/wallet/suspension-status')
  })

  test('includes development routes in the served document when they are enabled', async () => {
    const response = await request(createTestApp()).get('/wallet-api/openapi.json')
    const documentedPaths = Object.keys(response.body.paths as Record<string, unknown>)

    expect(documentedPaths).toEqual(
      expect.arrayContaining([
        '/wallet-api/dev/wallet/suspension-status',
        '/wallet-api/wallet-attestations',
      ]),
    )
    expect(documentedPaths.some((path) => path.startsWith('/v1/'))).toBe(false)
    expect(documentedPaths.some((path) => path.startsWith('/dev/'))).toBe(false)
    expect(documentedPaths.some((path) => path.startsWith('/wallet-api/dev/vp-'))).toBe(false)
  })
})
