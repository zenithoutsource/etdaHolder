import { walletOpenApiDocument } from './walletOpenApi'

type OpenApiOperation = {
  security?: Array<Record<string, string[]>>
  responses?: Record<string, unknown>
}

type OpenApiPathItem = {
  get?: OpenApiOperation
  post?: OpenApiOperation
}

const expectedPaths = [
  '/wallet-api/auth/email-status',
  '/wallet-api/auth/register',
  '/wallet-api/auth/login',
  '/wallet-api/auth/pin-reset/request',
  '/wallet-api/auth/pin-reset/verify',
  '/wallet-api/auth/pin-reset/confirm',
  '/wallet-api/auth/logout',
  '/wallet-api/wallet/accounts/wallets',
  '/wallet-api/wallet/{wallet}/credentials/import',
  '/wallet-api/wallet/push-token',
] as const

function paths(): Record<string, OpenApiPathItem> {
  return walletOpenApiDocument.paths as Record<string, OpenApiPathItem>
}

describe('walletOpenApiDocument', () => {
  test('publishes the complete normal Wallet API surface', () => {
    expect(walletOpenApiDocument.openapi).toBe('3.0.3')
    expect(walletOpenApiDocument.servers).toEqual([{ url: '/' }])
    expect(Object.keys(paths()).sort()).toEqual([...expectedPaths].sort())
  })

  test('does not publish development routes', () => {
    expect(
      Object.keys(paths()).some(
        (path) => path.startsWith('/wallet-api/dev/') || path.startsWith('/dev/'),
      ),
    ).toBe(false)
  })

  test('defines Bearer JWT authorization only on protected operations', () => {
    expect(walletOpenApiDocument.components.securitySchemes).toEqual({
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    })
    expect(paths()['/wallet-api/wallet/accounts/wallets'].get?.security).toEqual([
      { bearerAuth: [] },
    ])
    expect(
      paths()['/wallet-api/wallet/{wallet}/credentials/import'].post?.security,
    ).toEqual([{ bearerAuth: [] }])
    expect(paths()['/wallet-api/wallet/push-token'].post?.security).toBeUndefined()
    expect(paths()['/wallet-api/auth/login'].post?.security).toBeUndefined()
  })

  test('documents implemented success and error statuses', () => {
    expect(
      Object.keys(paths()['/wallet-api/auth/login'].post?.responses ?? {}).sort(),
    ).toEqual(['200', '400', '429', '500'])
    expect(
      Object.keys(
        paths()['/wallet-api/wallet/{wallet}/credentials/import'].post?.responses ?? {},
      ).sort(),
    ).toEqual(['201', '400', '401', '403', '500'])
    expect(
      Object.keys(paths()['/wallet-api/wallet/push-token'].post?.responses ?? {}).sort(),
    ).toEqual(['200', '400'])
  })
})
