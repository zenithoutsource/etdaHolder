import { defineConfig, type InputTransformerFn } from 'orval'

const ALLOWED_PATHS = new Set([
  '/wallet-api/wallet/{wallet}/keys/generate',
  '/wallet-api/wallet/{wallet}/dids/create/key',
  '/wallet-api/wallet/{wallet}/credentials/import',
])

const OPERATION_NAMES: Record<string, string> = {
  'post /wallet-api/wallet/{wallet}/keys/generate': 'generateKey',
  'post /wallet-api/wallet/{wallet}/dids/create/key': 'createDidKey',
  'post /wallet-api/wallet/{wallet}/credentials/import': 'importCredential',
}

const filterAllowedWalletApi: InputTransformerFn = (spec) => {
  const paths = Object.fromEntries(
    Object.entries(spec.paths ?? {})
      .filter(([path]) => ALLOWED_PATHS.has(path))
      .map(([path, pathItem]) => {
        if (!pathItem || typeof pathItem !== 'object') return [path, pathItem]

        const nextPathItem = { ...pathItem } as Record<string, unknown>
        const postOperation = nextPathItem.post
        const operationId = OPERATION_NAMES[`post ${path}`]

        if (operationId && postOperation && typeof postOperation === 'object') {
          nextPathItem.post = { ...postOperation, operationId }
        }

        return [path, nextPathItem]
      })
  )

  return {
    ...spec,
    paths,
  }
}

export default defineConfig({
  walletApi: {
    input: {
      target: './walletApi.json',
      validation: false,
      override: {
        transformer: filterAllowedWalletApi,
      },
    },
    output: {
      target: './src/sdk/walletApi.ts',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'single',
      clean: true,
      prettier: false,
      override: {
        query: {
          version: 5,
        },
      },
    },
  },
})
