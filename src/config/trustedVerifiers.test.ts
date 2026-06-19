import { buildTrustedVerifiersFromEnv } from './trustedVerifiers'

describe('trustedVerifiers', () => {
  test('builds Verifier API redirect_uri allowlist from env', () => {
    expect(
      buildTrustedVerifiersFromEnv({
        EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://192.100.10.48/',
        EXPO_PUBLIC_VERIFIER_NAME: 'Demo Verifier',
      }),
    ).toEqual([
      {
        clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
        name: 'Demo Verifier',
        allowedOrigins: ['http://192.100.10.48'],
      },
    ])
  })

  test('returns no trusted Verifiers when env is unset', () => {
    expect(buildTrustedVerifiersFromEnv({})).toEqual([])
  })
})
