import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToDidKey, p256PublicKeyToJwk, signEs256Prehash } from '@/src/services/crypto/p256Identity'
import { buildTrustedVerifiersFromEnv } from '@/src/config/trustedVerifiers'
import {
  authenticateDcApiSignedRequest,
  evaluateDcApiTrust,
  readCanonicalDcApiOrigin,
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
      origin: 'https://verifier.example.com',
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
      origin: 'https://verifier.example.com',
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
      origin: 'https://verifier.example.com',
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

  test('authenticates a signed dc_api JAR without response_uri using the platform origin in demo interop', async () => {
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const header = {
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: 'dc-api-verifier-key',
    }
    const payload = {
      client_id: clientId,
      response_mode: 'dc_api',
      nonce: 'nonce-1',
      expected_origins: ['https://digital-credentials.dev'],
      dcql_query: {
        credentials: [{ id: 'mdl', format: 'mso_mdoc', meta: { doctype_value: 'org.iso.18013.5.1.mDL' } }],
      },
    }
    const unsigned = `${encodePart(header)}.${encodePart(payload)}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
    const jar = `${unsigned}.${base64UrlEncodeBytes(signature)}`

    await expect(authenticateDcApiSignedRequest({
      request: jar,
      origin: 'https://digital-credentials.dev',
      trustedVerifiers: [],
    })).resolves.toMatchObject({
      clientId,
      responseMode: 'dc_api',
    })
  })

  test('authenticates signed dc_api did:web JARs when verifier DID host differs from the page origin', async () => {
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    const { secretKey, publicKey } = p256.keygen()
    const es256Jwk = { ...p256PublicKeyToJwk(publicKey), kid: 'verifier-es256-1', alg: 'ES256' }
    const clientId = 'decentralized_identifier:did:web:verifier.tonyhere.work'
    const header = {
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: 'did:web:verifier.tonyhere.work#key-1',
    }
    const payload = {
      client_id: clientId,
      response_mode: 'dc_api',
      nonce: 'nonce-tonyhere',
      expected_origins: ['https://demo.tonyhere.work'],
      dcql_query: {
        credentials: [{ id: 'mdl', format: 'mso_mdoc', meta: { doctype_value: 'org.iso.18013.5.1.mDL' } }],
      },
    }
    const unsigned = `${encodePart(header)}.${encodePart(payload)}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
    const jar = `${unsigned}.${base64UrlEncodeBytes(signature)}`
    const fetchMock = jest.fn(async () =>
      Response.json({
        id: 'did:web:verifier.tonyhere.work',
        verificationMethod: [
          {
            id: 'did:web:verifier.tonyhere.work#key-1',
            type: 'JsonWebKey2020',
            publicKeyJwk: es256Jwk,
          },
        ],
      }),
    )

    const signedRequest = await authenticateDcApiSignedRequest({
      request: jar,
      origin: 'https://demo.tonyhere.work',
      trustedVerifiers: [],
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(signedRequest).toMatchObject({
      clientId,
      responseMode: 'dc_api',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      origin: 'https://demo.tonyhere.work',
      signedRequest,
      trustedVerifiers: [],
      isDevelopment: true,
    })).toEqual({
      allowed: true,
      verifier: {
        clientId,
        name: 'demo.tonyhere.work',
        allowedOrigins: ['https://demo.tonyhere.work'],
      },
    })
  })

  test('trusts env-configured did:web verifier for signed dc_api without demo interop', async () => {
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

    const { secretKey, publicKey } = p256.keygen()
    const es256Jwk = { ...p256PublicKeyToJwk(publicKey), kid: 'verifier-es256-1', alg: 'ES256' }
    const clientId = 'decentralized_identifier:did:web:verifier.example.com'
    const trustedVerifiers = buildTrustedVerifiersFromEnv(
      {
        EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID: 'did:web:verifier.example.com',
        EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN: 'https://demo.example.com',
        EXPO_PUBLIC_VERIFIER_DID_WEB_NAME: 'Production Verifier',
        EXPO_PUBLIC_VERIFIER_DID_WEB_JWK: JSON.stringify(es256Jwk),
      },
      false,
    )
    const header = {
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: 'verifier-es256-1',
    }
    const payload = {
      client_id: clientId,
      response_mode: 'dc_api',
      nonce: 'nonce-env-trust',
      expected_origins: ['https://demo.example.com'],
      dcql_query: {
        credentials: [{ id: 'mdl', format: 'mso_mdoc', meta: { doctype_value: 'org.iso.18013.5.1.mDL' } }],
      },
    }
    const unsigned = `${encodePart(header)}.${encodePart(payload)}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
    const jar = `${unsigned}.${base64UrlEncodeBytes(signature)}`

    const signedRequest = await authenticateDcApiSignedRequest({
      request: jar,
      origin: 'https://demo.example.com',
      trustedVerifiers,
    })

    expect(evaluateDcApiTrust({
      isSignedRequest: true,
      origin: 'https://demo.example.com',
      signedRequest,
      trustedVerifiers,
      isDevelopment: false,
    })).toEqual({ allowed: true, verifier: trustedVerifiers[0] })
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

  test('readCanonicalDcApiOrigin strips trailing slash', () => {
    expect(readCanonicalDcApiOrigin('https://digital-credentials.dev/')).toBe(
      'https://digital-credentials.dev',
    )
  })

  test('readCanonicalDcApiOrigin strips explicit :443 default port', () => {
    expect(readCanonicalDcApiOrigin('https://digital-credentials.dev:443')).toBe(
      'https://digital-credentials.dev',
    )
  })
})
