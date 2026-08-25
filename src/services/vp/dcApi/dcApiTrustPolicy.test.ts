import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToDidKey, signEs256Prehash } from '@/src/services/crypto/p256Identity'
import {
  authenticateDcApiSignedRequest,
  evaluateDcApiTrust,
  readDcApiMdocAudience,
} from './dcApiTrustPolicy'

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function createSignedDcApiJar(input: {
  clientId: string
  origin: string
  secretKey: Uint8Array
  expectedOrigins?: string[]
}): string {
  const header = {
    alg: 'ES256',
    typ: 'oauth-authz-req+jwt',
    kid: 'dc-api-verifier-key',
  }
  const payload = {
    client_id: input.clientId,
    response_uri: `${input.origin}/oid4vp/response`,
    response_mode: 'dc_api.jwt',
    nonce: 'nonce-1',
    expected_origins: input.expectedOrigins ?? [input.origin],
  }
  const unsigned = `${encodePart(header)}.${encodePart(payload)}`
  const signature = signEs256Prehash(new TextEncoder().encode(unsigned), input.secretKey)
  return `${unsigned}.${base64UrlEncodeBytes(signature)}`
}

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

  test('rejects unsigned dc_api in a release-like context with no build profile', () => {
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/unsigned/i) })
  })

  test('rejects unsigned dc_api with an unexpected release profile when development is false', () => {
    process.env.EXPO_PUBLIC_BUILD_PROFILE = 'staging'
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/unsigned/i) })
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

  test('rejects a caller-created signed evidence shape', () => {
    const forgedEvidence = {
      clientId: 'decentralized_identifier:did:web:verifier.example.com',
      responseMode: 'dc_api.jwt' as const,
      authorizationRequest: {
        client_id: 'decentralized_identifier:did:web:verifier.example.com',
        response_mode: 'dc_api.jwt',
        expected_origins: ['https://verifier.example.com'],
      },
    }

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      origin: 'https://verifier.example.com',
      signedRequest: forgedEvidence,
      trustedVerifiers: [],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/authenticated JAR/i) })
  })

  test('rejects a parser-authenticated signed request when no verifier remains trusted', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const verifier = {
      clientId: `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`,
      name: 'Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    }
    const signedRequest = await authenticateDcApiSignedRequest({
      request: createSignedDcApiJar({
        clientId: verifier.clientId,
        origin: 'https://verifier.example.com',
        secretKey,
      }),
      trustedVerifiers: [verifier],
    })

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      origin: 'https://verifier.example.com',
      signedRequest,
      trustedVerifiers: [],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/not trusted/i) })
  })

  test('rejects a parser-authenticated signed request when expected_origins excludes the platform origin', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const verifier = {
      clientId: `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`,
      name: 'Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    }
    const signedRequest = await authenticateDcApiSignedRequest({
      request: createSignedDcApiJar({
        clientId: verifier.clientId,
        origin: 'https://verifier.example.com',
        secretKey,
        expectedOrigins: ['https://attacker.example.com'],
      }),
      trustedVerifiers: [verifier],
    })

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      origin: 'https://verifier.example.com',
      signedRequest,
      trustedVerifiers: [verifier],
      isDevelopment: false,
    })).toMatchObject({ allowed: false, reason: expect.stringMatching(/expected_origins/i) })
  })

  test('allows a parser-authenticated signed request from a trusted verifier at its expected origin', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const verifier = {
      clientId: `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`,
      name: 'Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    }
    const signedRequest = await authenticateDcApiSignedRequest({
      request: createSignedDcApiJar({
        clientId: verifier.clientId,
        origin: 'https://verifier.example.com',
        secretKey,
      }),
      trustedVerifiers: [verifier],
    })

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      origin: 'https://verifier.example.com',
      signedRequest,
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

  test('rejects an invalid origin instead of constructing an mdoc audience', () => {
    expect(() => readDcApiMdocAudience('http://verifier.example.com')).toThrow(/origin must be HTTPS/i)
  })
})
