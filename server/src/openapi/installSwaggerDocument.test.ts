import express from 'express'
import request from 'supertest'

import { installSwaggerDocument } from './installSwaggerDocument'

const document = {
  openapi: '3.0.3',
  info: { title: 'Synthetic API', version: '1.0.0' },
  paths: {},
}

test('serves one OpenAPI document and its Swagger UI', async () => {
  const app = express()
  installSwaggerDocument(app, {
    docsPath: '/synthetic/docs',
    openApiPath: '/synthetic/openapi.json',
    document,
    title: 'Synthetic API',
  })

  const json = await request(app).get('/synthetic/openapi.json')
  expect(json.status).toBe(200)
  expect(json.type).toBe('application/json')
  expect(json.body).toEqual(document)

  const html = await request(app).get('/synthetic/docs/')
  expect(html.status).toBe(200)
  expect(html.type).toBe('text/html')
  expect(html.text).toContain('<title>Synthetic API</title>')
  expect(html.text).toContain('id="swagger-ui"')
})
