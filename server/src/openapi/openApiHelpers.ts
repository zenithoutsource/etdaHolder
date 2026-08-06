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
