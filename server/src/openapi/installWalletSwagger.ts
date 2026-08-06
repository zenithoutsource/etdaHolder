import type { Express } from 'express'

import { installSwaggerDocument } from './installSwaggerDocument'
import { walletOpenApiDocument } from './walletOpenApi'

export function installWalletSwagger(app: Express): void {
  installSwaggerDocument(app, {
    docsPath: '/wallet-api/docs',
    openApiPath: '/wallet-api/openapi.json',
    document: walletOpenApiDocument,
    title: 'Wallet Backend API',
  })
}
