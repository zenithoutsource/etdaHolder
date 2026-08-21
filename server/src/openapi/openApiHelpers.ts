type OpenApiTag = {
  name: string
  description?: string
}

type OpenApiDocumentLike = {
  openapi?: string
  info?: {
    title?: string
    version?: string
    description?: string
  }
  servers?: readonly unknown[]
  tags?: readonly OpenApiTag[]
  paths: Record<string, unknown>
  components?: {
    securitySchemes?: Record<string, unknown>
    schemas?: Record<string, unknown>
    responses?: Record<string, unknown>
  }
}

export function mergeOpenApiDocuments(
  base: object,
  extra: object,
): Record<string, unknown> {
  const baseDocument = base as OpenApiDocumentLike
  const extraDocument = extra as OpenApiDocumentLike
  const tagsByName = new Map<string, OpenApiTag>()
  for (const tag of [...(baseDocument.tags ?? []), ...(extraDocument.tags ?? [])]) {
    if (!tagsByName.has(tag.name)) tagsByName.set(tag.name, tag)
  }

  const description = [baseDocument.info?.description, extraDocument.info?.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n\n')

  return {
    ...baseDocument,
    info: {
      ...baseDocument.info,
      ...(description ? { description } : {}),
    },
    tags: [...tagsByName.values()],
    paths: {
      ...baseDocument.paths,
      ...extraDocument.paths,
    },
    components: {
      securitySchemes: {
        ...baseDocument.components?.securitySchemes,
        ...extraDocument.components?.securitySchemes,
      },
      schemas: {
        ...baseDocument.components?.schemas,
        ...extraDocument.components?.schemas,
      },
      responses: {
        ...baseDocument.components?.responses,
        ...extraDocument.components?.responses,
      },
    },
  }
}

export const jsonContent = (schema: Record<string, unknown>) => ({
  content: {
    'application/json': { schema },
  },
})

export const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
})

export const responseRef = (name: string) => ({
  $ref: `#/components/responses/${name}`,
})

export const errorResponseSchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: { type: 'string', example: 'Bad Request' },
  },
} as const

export const createErrorResponse = (description: string) => ({
  description,
  ...jsonContent(schemaRef('ErrorResponse')),
})
