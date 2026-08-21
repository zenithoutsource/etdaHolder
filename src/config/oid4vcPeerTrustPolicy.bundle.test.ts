import { transformSync } from '@babel/core'
import { readFileSync } from 'node:fs'

describe('oid4vc peer trust production bundle', () => {
  test('inlines EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER via direct env access', () => {
    const originalEnv = { ...process.env }
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'

    try {
      const filename = require.resolve('./oid4vcPeerTrustPolicy')
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
      expect(code).toContain("==='true'")
      expect(code).not.toContain('process.env.EXPO_PUBLIC_')
    } finally {
      process.env = originalEnv
    }
  })
})
