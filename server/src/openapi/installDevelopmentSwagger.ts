import type { Express } from 'express'

import { installSwaggerDocument } from './installSwaggerDocument'
import { developmentOpenApiDocument } from './developmentOpenApi'

const DEVELOPMENT_SWAGGER_MOUNTS = [
  { docsPath: '/wallet-api/dev/docs', openApiPath: '/wallet-api/dev/openapi.json' },
  { docsPath: '/dev/docs', openApiPath: '/dev/openapi.json' },
] as const

export function installDevelopmentSwagger(app: Express): void {
  for (const mount of DEVELOPMENT_SWAGGER_MOUNTS) {
    installSwaggerDocument(app, {
      docsPath: mount.docsPath,
      openApiPath: mount.openApiPath,
      document: developmentOpenApiDocument as Record<string, unknown>,
      title: 'Development API',
    })
  }
}
