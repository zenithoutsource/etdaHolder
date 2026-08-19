import type { Express, RequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'

export type SwaggerDocumentOptions = {
  docsPath: string
  openApiPath: string
  document: Record<string, unknown>
  title: string
}

export function installSwaggerDocument(
  app: Express,
  options: SwaggerDocumentOptions,
): void {
  app.get(options.openApiPath, (_req, res) => {
    res.status(200).json(options.document)
  })

  const page = swaggerUi.setup(options.document, {
    customSiteTitle: options.title,
  }) as unknown as RequestHandler

  const swaggerUiServe = swaggerUi.serveFiles(options.document) as unknown as RequestHandler[]
  app.use(options.docsPath, ...swaggerUiServe, page)
}
