import { developmentOpenApiDocument } from './developmentOpenApi'

const expectedOperations = [
  'GET /wallet-api/dev/wallet/suspension-status',
  'GET /wallet-api/dev/wallet/renewal-status',
  'POST /wallet-api/dev/presentation/suspend-access',
  'POST /wallet-api/dev/issuer/suspend',
  'POST /wallet-api/dev/wallet/mark-used',
  'GET /wallet-api/dev/wallet/used-status',
  'POST /wallet-api/dev/issuer/holder-revoke/nonce',
  'POST /wallet-api/dev/issuer/holder-revoke',
  'GET /wallet-api/dev/wallet/revoke-status',
  'POST /wallet-api/dev/webhook/credential-event',
  'POST /wallet-api/dev/wallet/renewal-request',
  'POST /wallet-api/dev/wallet/renewal-vp/response',
] as const

function collectOperations(): string[] {
  const operations: string[] = []
  const paths = developmentOpenApiDocument.paths as Record<
    string,
    Partial<Record<'get' | 'post' | 'put' | 'delete' | 'patch', unknown>>
  >
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      if (pathItem[method]) {
        operations.push(`${method.toUpperCase()} ${path}`)
      }
    }
  }
  return operations.sort()
}

test('documents exactly the Development API inventory', () => {
  expect(collectOperations()).toEqual([...expectedOperations].sort())
})

test('labels Development APIs as non-production and uses safe examples', () => {
  expect(developmentOpenApiDocument.info.description).toContain('not available in production')
  expect(JSON.stringify(developmentOpenApiDocument)).not.toContain('Bearer ey')
  expect(JSON.stringify(developmentOpenApiDocument)).not.toContain('@gmail.com')
})
