import { evaluateDcApiTrust, readDcApiMdocAudience } from './dcApiTrustPolicy'

describe('evaluateDcApiTrust', () => {
  const originalEnvironment = {
    buildProfile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
    demoInterop: process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP,
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalEnvironment.buildProfile === undefined) {
      delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    } else {
      process.env.EXPO_PUBLIC_BUILD_PROFILE = originalEnvironment.buildProfile
    }

    if (originalEnvironment.demoInterop === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    } else {
      process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalEnvironment.demoInterop
    }
  })

  test('rejects unsigned dc_api in production release profile', () => {
    process.env.EXPO_PUBLIC_BUILD_PROFILE = 'production'
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    const result = evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: false,
    })

    expect(result).toMatchObject({ allowed: false })
    expect(result).toMatchObject({ reason: expect.stringMatching(/unsigned/i) })
  })

  test('allows unsigned dc_api in development when demo interop is enabled and origin is HTTPS', () => {
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: true,
    })).toEqual({ allowed: true })
  })

  test('rejects non-HTTPS origin for unsigned dc_api', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'http://insecure.example',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: true,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/HTTPS/i) })
  })

  test('rejects a malformed HTTPS origin for unsigned dc_api', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: true,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/HTTPS/i) })
  })

  test('rejects a signed dc_api request without verified JAR evidence', () => {
    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      signedRequestVerified: false,
      origin: 'https://verifier.example.com',
      responseMode: 'dc_api.jwt',
      clientId: 'decentralized_identifier:did:web:verifier.example.com',
      authorizationRequest: {
        client_id: 'decentralized_identifier:did:web:verifier.example.com',
        nonce: 'n1',
        response_mode: 'dc_api.jwt',
        expected_origins: ['https://verifier.example.com'],
      },
      trustedVerifiers: [{
        clientId: 'decentralized_identifier:did:web:verifier.example.com',
        name: 'Verifier',
        allowedOrigins: ['https://verifier.example.com'],
      }],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/verified/i) })
  })

  test('rejects a verified signed dc_api request when expected_origins does not include the platform origin', () => {
    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      signedRequestVerified: true,
      origin: 'https://verifier.example.com',
      responseMode: 'dc_api.jwt',
      clientId: 'decentralized_identifier:did:web:verifier.example.com',
      authorizationRequest: {
        client_id: 'decentralized_identifier:did:web:verifier.example.com',
        nonce: 'n1',
        response_mode: 'dc_api.jwt',
        expected_origins: ['https://attacker.example.com'],
      },
      trustedVerifiers: [{
        clientId: 'decentralized_identifier:did:web:verifier.example.com',
        name: 'Verifier',
        allowedOrigins: ['https://verifier.example.com'],
      }],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/expected_origins/i) })
  })

  test('allows a verified signed dc_api request from a trusted verifier at its expected origin', () => {
    const verifier = {
      clientId: 'decentralized_identifier:did:web:verifier.example.com',
      name: 'Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    }

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      signedRequestVerified: true,
      origin: 'https://verifier.example.com',
      responseMode: 'dc_api.jwt',
      clientId: verifier.clientId,
      authorizationRequest: {
        client_id: verifier.clientId,
        nonce: 'n1',
        response_mode: 'dc_api.jwt',
        expected_origins: ['https://verifier.example.com'],
      },
      trustedVerifiers: [verifier],
      isDevelopment: false,
    })).toEqual({ allowed: true, verifier })
  })
})

describe('readDcApiMdocAudience', () => {
  test('prefixes the normalized DC API origin', () => {
    expect(readDcApiMdocAudience('https://verifier.example.com/')).toBe(
      'origin:https://verifier.example.com',
    )
  })
})
