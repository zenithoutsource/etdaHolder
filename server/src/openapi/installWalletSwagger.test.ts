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
  })

  test('keeps development routes out of the public document', async () => {
    const response = await request(createTestApp()).get('/wallet-api/openapi.json')
    const documentedPaths = Object.keys(response.body.paths as Record<string, unknown>)

    expect(
      documentedPaths.some(
        (path) => path.startsWith('/wallet-api/dev/') || path.startsWith('/dev/'),
      ),
    ).toBe(false)
  })
})
