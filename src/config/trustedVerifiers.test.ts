import { buildTrustedVerifiersFromEnv, readTrustedVerifierBuildPolicy } from './trustedVerifiers'

describe('trustedVerifiers', () => {
  test('builds Verifier API redirect_uri allowlist with its fixed display name', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://verifier.zenithcomp.co.th:455/',
          EXPO_PUBLIC_VERIFIER_NAME: 'Demo Verifier',
        },
        true,
      ),
    ).toEqual([
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
        name: 'Verifier API',
        allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
      },
    ])
  })

  test('omits Verifier API redirect_uri allowlist outside development by default', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://verifier.zenithcomp.co.th:455/',
          EXPO_PUBLIC_VERIFIER_NAME: 'Demo Verifier',
        },
        false,
      ),
    ).toEqual([])
  })

  test('allows HTTPS redirect_uri Verifier API trust outside development when explicitly enabled', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'https://verifier.zenithcomp.co.th:455/',
          EXPO_PUBLIC_VERIFIER_NAME: 'Demo Verifier',
          EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST: 'true',
        },
        false,
      ),
    ).toEqual([
      {
        clientId: 'redirect_uri:https://verifier.zenithcomp.co.th:455/openid4vc/verify',
        name: 'Verifier API',
        allowedOrigins: ['https://verifier.zenithcomp.co.th:455'],
      },
    ])
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

  test('supports comma-separated did:web allowed origins for Scan and DC API hosts', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID: 'did:web:verifier.example.com',
          EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN:
            'https://demo.example.com,https://verifier.example.com/',
          EXPO_PUBLIC_VERIFIER_DID_WEB_NAME: 'Interop Verifier',
        },
        false,
      ),
    ).toEqual([
      {
        clientId: 'decentralized_identifier:did:web:verifier.example.com',
        name: 'Interop Verifier',
        allowedOrigins: ['https://demo.example.com', 'https://verifier.example.com'],
      },
    ])
  })

  test('adds decentralized_identifier did:key verifier when env is configured', () => {
    expect(
      buildTrustedVerifiersFromEnv(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'https://verifier.zenithcomp.co.th:455/',
          EXPO_PUBLIC_VERIFIER_DID_KEY_CLIENT_ID:
            'did:key:zDnaesfzUXzhHkdZvTWTQaZAZTFcXYZnMj5RroE9cSXcBkNb7',
          EXPO_PUBLIC_VERIFIER_DID_KEY_NAME: 'Did Key Verifier',
        },
        false,
      ),
    ).toEqual([
      {
        clientId:
          'decentralized_identifier:did:key:zDnaesfzUXzhHkdZvTWTQaZAZTFcXYZnMj5RroE9cSXcBkNb7',
        name: 'Did Key Verifier',
        allowedOrigins: ['https://verifier.zenithcomp.co.th:455'],
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
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://verifier.zenithcomp.co.th:455/',
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
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://verifier.zenithcomp.co.th:455/',
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
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'http://verifier.zenithcomp.co.th:455/',
        },
        false,
      ),
    ).toEqual({ includesRedirectUri: false, includesDidWeb: false })

    expect(
      readTrustedVerifierBuildPolicy(
        {
          EXPO_PUBLIC_VERIFIER_API_BASE_URL: 'https://verifier.zenithcomp.co.th:455/',
          EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST: 'true',
        },
        false,
      ),
    ).toEqual({ includesRedirectUri: true, includesDidWeb: false })
  })
})
