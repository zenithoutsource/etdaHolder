import { assertWalletApiRuntimePolicy } from './walletApiRuntimePolicy'

describe('wallet API runtime policy', () => {
  test('allows local HTTP without pins during development', () => {
    expect(() =>
      assertWalletApiRuntimePolicy({
        baseUrl: 'http://192.168.1.10:4000',
        isDevelopment: true,
        pinnedCertificates: [],
        platformOS: 'ios',
      }),
    ).not.toThrow()
  })

  test('blocks plain HTTP in non-development native runtimes', () => {
    expect(() =>
      assertWalletApiRuntimePolicy({
        baseUrl: 'http://api.example.com',
        isDevelopment: false,
        pinnedCertificates: ['wallet-api-prod'],
        platformOS: 'android',
      }),
    ).toThrow('WalletApiTransportSecurityRequired')
  })

  test('blocks HTTPS without configured pins in non-development native runtimes', () => {
    expect(() =>
      assertWalletApiRuntimePolicy({
        baseUrl: 'https://api.example.com',
        isDevelopment: false,
        pinnedCertificates: [],
        platformOS: 'ios',
      }),
    ).toThrow('WalletApiCertificatePinsRequired')
  })

  test('does not block web runtime certificate handling', () => {
    expect(() =>
      assertWalletApiRuntimePolicy({
        baseUrl: 'https://api.example.com',
        isDevelopment: false,
        pinnedCertificates: [],
        platformOS: 'web',
      }),
    ).not.toThrow()
  })
})
