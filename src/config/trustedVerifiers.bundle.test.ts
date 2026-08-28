import { transformSync } from '@babel/core'
import { readFileSync } from 'node:fs'

describe('trusted verifier production bundle', () => {
  test('inlines every public trust setting used by the release allowlist', () => {
    const originalEnv = { ...process.env }
    process.env.EXPO_PUBLIC_VERIFIER_API_BASE_URL = 'https://bundle-verifier.example.com'
    process.env.EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST = 'true'
    process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID = 'did:web:bundle-verifier.example.com'
    process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN =
      'https://bundle-verifier.example.com'
    process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_NAME = 'Bundle DID Verifier'
    process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_JWK =
      '{"kty":"OKP","crv":"Ed25519","x":"bundle-verifier-key"}'
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID =
      'did:web:bundle-issuer.example.com'
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN =
      'https://bundle-issuer.example.com'
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME = 'Bundle Issuer'
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK =
      '{"kty":"OKP","crv":"Ed25519","x":"bundle-issuer-key"}'
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'https://bundle-wallet.example.com'

    try {
      const filename = require.resolve('./trustedVerifiers')
      const source = readFileSync(filename, 'utf8')
      const transformed = transformSync(source, {
        filename,
        babelrc: false,
        configFile: false,
        presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
        caller: {
          name: 'metro',
          isDev: false,
          isServer: false,
        } as unknown as { name: string },
      })

      const code = transformed?.code ?? ''
      for (const expected of [
        'https://bundle-verifier.example.com',
        'did:web:bundle-verifier.example.com',
        'Bundle DID Verifier',
        'bundle-verifier-key',
        'did:web:bundle-issuer.example.com',
        'https://bundle-issuer.example.com',
        'Bundle Issuer',
        'bundle-issuer-key',
        'https://bundle-wallet.example.com',
      ]) {
        expect(code).toContain(expected)
      }
      expect(code).toMatch(/EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST:\s*['"]true['"]/)
      expect(code).not.toContain('process.env.EXPO_PUBLIC_')
      expect(transformed?.code).not.toContain('env = process.env')
    } finally {
      process.env = originalEnv
    }
  })
})
