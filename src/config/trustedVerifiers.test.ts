import { buildTrustedVerifiersFromEnv, readTrustedVerifierBuildPolicy } from './trustedVerifiers'

describe('trustedVerifiers', () => {
  test('builds Verifier API redirect_uri allowlist from env', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://192.100.10.48/',
          EXPO_PUBLIC_VERIFIER_NAME: 'Demo Verifier',
        },
        true,
      ),
    ).toEqual([
      {
        clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
        name: 'Demo Verifier',
        allowedOrigins: ['http://192.100.10.48'],
      },
    ])
  })

  test('omits Verifier API redirect_uri allowlist outside development', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://192.100.10.48/',
          EXPO_PUBLIC_VERIFIER_NAME: 'Demo Verifier',
        },
        false,
      ),
    ).toEqual([])
  })

  test('adds decentralized_identifier did:web verifier when env is configured', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID: 'did:web:verifier.example.com',
          EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN: 'https://verifier.example.com',
          EXPO_PUBLIC_VERIFIER_DID_WEB_NAME: 'Production Verifier',
          EXPO_PUBLIC_VERIFIER_DID_WEB_JWK: JSON.stringify({
            kty: 'OKP',
            crv: 'Ed25519',
            x: 'abc',
          }),
        },
        false,
      ),
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

  test('adds decentralized_identifier did:web issuer OID4VP relying party when env is configured', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID: 'decentralized_identifier:did:web:issuer.example.com',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN: 'https://issuer.example.com/oid4vp/callback',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME: 'PID Issuer',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK: JSON.stringify({
            kty: 'OKP',
            crv: 'Ed25519',
            x: 'issuer-key',
          }),
        },
        false,
      ),
    ).toEqual([
      {
        clientId: 'decentralized_identifier:did:web:issuer.example.com',
        name: 'PID Issuer',
        allowedOrigins: ['https://issuer.example.com'],
        verificationJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'issuer-key',
        },
      },
    ])
  })

  test('keeps issuer OID4VP did:web trust in release without adding dev redirect_uri entries', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://192.100.10.48/',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID: 'did:web:issuer.example.com',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN: 'https://issuer.example.com',
        },
        false,
      ),
    ).toEqual([
      {
        clientId: 'decentralized_identifier:did:web:issuer.example.com',
        name: 'Trusted Issuer',
        allowedOrigins: ['https://issuer.example.com'],
      },
    ])
  })

  test('returns no trusted Verifiers when env is unset', () => {
    expect(buildTrustedVerifiersFromEnv({}, false)).toEqual([])
  })

  test('reports build policy from generated trusted verifier schemes', () => {
    expect(
      readTrustedVerifierBuildPolicy(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://192.100.10.48/',
          EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID: 'did:web:verifier.example.com',
          EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN: 'https://verifier.example.com',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID: 'did:web:issuer.example.com',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN: 'https://issuer.example.com',
        },
        true,
      ),
    ).toEqual({ includesRedirectUri: true, includesDidWeb: true })

    expect(
      readTrustedVerifierBuildPolicy(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://192.100.10.48/',
        },
        false,
      ),
    ).toEqual({ includesRedirectUri: false, includesDidWeb: false })
  })
})
