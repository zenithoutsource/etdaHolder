import type { Express } from 'express'

import { installSwaggerDocument } from './installSwaggerDocument'
import { developmentOpenApiDocument } from './developmentOpenApi'

export function installDevelopmentSwagger(app: Express): void {
  installSwaggerDocument(app, {
    docsPath: '/dev/docs',
    openApiPath: '/dev/openapi.json',
    document: developmentOpenApiDocument,
    title: 'Development API',
  })
}
