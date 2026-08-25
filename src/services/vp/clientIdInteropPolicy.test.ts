import { isClientIdSchemeSupportedForTrust } from './clientIdInteropPolicy'

describe('clientIdInteropPolicy', () => {
  const originalDemo = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  afterEach(() => {
    if (originalDemo === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    } else {
      process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalDemo
    }
  })

  test('x509_hash is supported when demo interop is enabled', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(isClientIdSchemeSupportedForTrust('x509_hash', false)).toBe(true)
  })
})
