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

  test('adds decentralized_identifier did:web verifier when env is configured', () => {
    expect(
      buildTrustedVerifiersFromEnv({
        EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID: 'did:web:verifier.example.com',
        EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN: 'https://verifier.example.com',
        EXPO_PUBLIC_VERIFIER_DID_WEB_NAME: 'Production Verifier',
        EXPO_PUBLIC_VERIFIER_DID_WEB_JWK: JSON.stringify({
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'abc',
        }),
      }),
    ).toEqual([
      {
        clientId: 'decentralized_identifier:did:web:verifier.example.com',
        name: 'Production Verifier',
        allowedOrigins: ['https://verifier.example.com'],
        verificationJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'abc',
        },
      },
    ])
  })

  test('returns no trusted Verifiers when env is unset', () => {
    expect(buildTrustedVerifiersFromEnv({})).toEqual([])
  })
})
