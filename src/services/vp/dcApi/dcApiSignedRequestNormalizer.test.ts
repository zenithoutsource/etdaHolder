import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToDidKey, signEs256Prehash } from '@/src/services/crypto/p256Identity'

import { readCompactJarFromSignedDcApiRequest, resolveCompactJarFromSignedDcApiRequest } from './dcApiSignedRequestNormalizer'
import { parseDcApiIncomingRequest } from './dcApiRequestParser'
import type { DcApiIncomingRequest } from './dcApiRequestParser'

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function createCompactSignedJar(input: {
  clientId: string
  payload: Record<string, unknown>
  secretKey: Uint8Array
  header?: Record<string, unknown>
}): string {
  const header = {
    alg: 'ES256',
    typ: 'oauth-authz-req+jwt',
    kid: 'dc-api-verifier-key',
    ...input.header,
  }
  const unsigned = `${encodePart(header)}.${encodePart(input.payload)}`
  const signature = signEs256Prehash(new TextEncoder().encode(unsigned), input.secretKey)
  return `${unsigned}.${base64UrlEncodeBytes(signature)}`
}

function createJwsJsonSignedRequest(input: {
  clientId: string
  payload: Record<string, unknown>
  secretKey: Uint8Array
  header?: Record<string, unknown>
}): Record<string, unknown> {
  const protectedHeader = {
    alg: 'ES256',
    typ: 'oauth-authz-req+jwt',
    client_id: input.clientId,
    ...input.header,
  }
  const payloadSegment = encodePart(input.payload)
  const protectedSegment = encodePart(protectedHeader)
  const unsigned = `${protectedSegment}.${payloadSegment}`
  const signature = signEs256Prehash(new TextEncoder().encode(unsigned), input.secretKey)
  return {
    payload: payloadSegment,
    signatures: [
      {
        protected: protectedSegment,
        signature: base64UrlEncodeBytes(signature),
      },
    ],
  }
}

const unsignedRequest: DcApiIncomingRequest = {
  sessionId: 'dc-session-1',
  protocol: 'openid4vp-v1-unsigned',
  origin: 'https://digital-credentials.dev',
  request: {
    response_mode: 'dc_api',
    nonce: 'nonce-1',
    dcql_query: {
      credentials: [
        {
          id: 'mdl',
          format: 'mso_mdoc',
          meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
          claims: [{ path: ['org.iso.18013.5.1', 'family_name'] }],
        },
      ],
    },
  },
}

describe('readCompactJarFromSignedDcApiRequest', () => {
  test('returns a compact JAR from the request field', () => {
    const jar = 'eyJhbGciOiJFUzI1NiJ9.eyJub25jZSI6IjEifQ.signature'
    expect(readCompactJarFromSignedDcApiRequest({ request: jar })).toBe(jar)
  })

  test('builds a compact JAR from JWS JSON serialization', () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const body = createJwsJsonSignedRequest({
      clientId,
      secretKey,
      payload: {
        response_mode: 'dc_api.jwt',
        nonce: 'nonce-json',
        expected_origins: ['https://playground.animo.id'],
        dcql_query: unsignedRequest.request.dcql_query,
      },
    })

    const compact = readCompactJarFromSignedDcApiRequest(body)
    expect(compact?.split('.')).toHaveLength(3)
  })
})

describe('parseDcApiIncomingRequest signed JWS JSON', () => {
  const originalDemoInterop = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  beforeEach(() => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
  })

  afterEach(() => {
    if (originalDemoInterop === undefined) delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    else process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalDemoInterop
  })

  test('authenticates signed dc_api requests that use JWS JSON serialization', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const request = createJwsJsonSignedRequest({
      clientId,
      secretKey,
      payload: {
        response_mode: 'dc_api.jwt',
        nonce: 'signed-nonce-json',
        expected_origins: ['https://playground.animo.id'],
        dcql_query: unsignedRequest.request.dcql_query,
      },
    })

    await expect(parseDcApiIncomingRequest({
      sessionId: 'dc-session-json',
      protocol: 'openid4vp-v1-signed',
      origin: 'https://playground.animo.id',
      request,
    }, { trustedVerifiers: [] })).resolves.toMatchObject({
      isSignedRequest: true,
      responseMode: 'dc_api.jwt',
      authorizationRequest: {
        client_id: clientId,
        nonce: 'signed-nonce-json',
      },
    })
  })

  test('still accepts compact JAR in the request field', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const jar = createCompactSignedJar({
      clientId,
      secretKey,
      payload: {
        client_id: clientId,
        response_mode: 'dc_api',
        nonce: 'signed-nonce-compact',
        expected_origins: ['https://digital-credentials.dev'],
        dcql_query: unsignedRequest.request.dcql_query,
      },
    })

    await expect(parseDcApiIncomingRequest({
      sessionId: 'dc-session-compact',
      protocol: 'openid4vp-v1-signed',
      origin: 'https://digital-credentials.dev',
      request: { request: jar },
    }, { trustedVerifiers: [] })).resolves.toMatchObject({
      isSignedRequest: true,
      responseMode: 'dc_api',
    })
  })

  test('fetches a compact JAR from an HTTPS request_uri', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const jar = createCompactSignedJar({
      clientId,
      secretKey,
      payload: {
        client_id: clientId,
        response_mode: 'dc_api',
        nonce: 'signed-nonce-uri',
        expected_origins: ['https://playground.animo.id'],
        dcql_query: unsignedRequest.request.dcql_query,
      },
    })

    const fetchMock = jest.fn(async () => new Response(jar, { status: 200 }))
    await expect(resolveCompactJarFromSignedDcApiRequest({
      request_uri: 'https://playground.animo.id/oid4vp/request/1',
    }, fetchMock as unknown as typeof fetch)).resolves.toBe(jar)
    expect(fetchMock).toHaveBeenCalledWith('https://playground.animo.id/oid4vp/request/1', { method: 'GET' })
  })
})
