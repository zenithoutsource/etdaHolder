import type { Express, RequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'

import { walletOpenApiDocument } from './walletOpenApi'

// swagger-ui-express resolves a nested Express type version; its runtime middleware
// remains compatible with this application's Express handler contract.
const swaggerUiServe = swaggerUi.serve as unknown as RequestHandler[]
const createSwaggerUiPage = (): RequestHandler =>
  swaggerUi.setup(walletOpenApiDocument, {
    customSiteTitle: 'Wallet Backend API',
  }) as unknown as RequestHandler

export function installWalletSwagger(app: Express): void {
  app.get('/wallet-api/openapi.json', (_req, res) => {
    res.status(200).json(walletOpenApiDocument)
  })

  app.use(
    '/wallet-api/docs',
    ...swaggerUiServe,
    createSwaggerUiPage(),
  )
}
