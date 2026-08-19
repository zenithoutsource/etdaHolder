import type { Express } from 'express'

import { areDevelopmentApisEnabled } from '../developmentApiPolicy'
import { developmentOpenApiDocument } from './developmentOpenApi'
import { installSwaggerDocument } from './installSwaggerDocument'
import { mergeOpenApiDocuments } from './openApiHelpers'
import { walletOpenApiDocument } from './walletOpenApi'

export function installWalletSwagger(app: Express): void {
  const document = areDevelopmentApisEnabled()
    ? mergeOpenApiDocuments(walletOpenApiDocument, developmentOpenApiDocument)
    : walletOpenApiDocument

  installSwaggerDocument(app, {
    docsPath: '/wallet-api/docs',
    openApiPath: '/wallet-api/openapi.json',
    document: document as Record<string, unknown>,
    title: 'Wallet Backend API',
  })
}
