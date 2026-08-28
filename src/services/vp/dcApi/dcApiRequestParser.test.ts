/**
 * Verifies DC API platform-request normalization and authenticated signed-JAR parsing.
 */
import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToDidKey, signEs256Prehash } from '@/src/services/crypto/p256Identity'

import {
  assertSupportedDcApiResponseMode,
  parseDcApiIncomingRequest,
  type DcApiIncomingRequest,
} from './dcApiRequestParser'

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function createSignedJar(
  authorizationRequest: Record<string, unknown>,
  secretKey: Uint8Array,
): string {
  const unsigned = `${encodePart({
    alg: 'ES256',
    typ: 'oauth-authz-req+jwt',
    kid: 'dc-api-verifier-key',
  })}.${encodePart(authorizationRequest)}`
  const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
  return `${unsigned}.${base64UrlEncodeBytes(signature)}`
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

describe('parseDcApiIncomingRequest', () => {
  test('normalizes an unsigned platform request into the internal DCQL request shape', async () => {
    await expect(parseDcApiIncomingRequest(unsignedRequest, { trustedVerifiers: [] })).resolves.toMatchObject({
      sessionId: 'dc-session-1',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      isSignedRequest: false,
      responseMode: 'dc_api',
      dcqlQuery: {
        credentials: [
          {
            id: 'mdl',
            format: 'mso_mdoc',
            meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
            claims: [{ path: ['org.iso.18013.5.1', 'family_name'] }],
          },
        ],
      },
    })
  })

  test('extracts and verifies the compact JAR for the signed protocol identifier', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const verifier = {
      clientId,
      name: 'Signed DC API Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    }
    const jar = createSignedJar({
      client_id: clientId,
      response_uri: 'https://verifier.example.com/oid4vp/response',
      response_mode: 'dc_api.jwt',
      nonce: 'signed-nonce-1',
      expected_origins: ['https://verifier.example.com'],
      dcql_query: unsignedRequest.request.dcql_query,
    }, secretKey)

    const parsed = await parseDcApiIncomingRequest({
      sessionId: 'dc-session-signed',
      protocol: 'openid4vp-v1-signed',
      origin: 'https://verifier.example.com',
      request: { request: jar },
    }, { trustedVerifiers: [verifier] })

    expect(parsed).toMatchObject({
      isSignedRequest: true,
      responseMode: 'dc_api.jwt',
      authorizationRequest: {
        client_id: clientId,
        nonce: 'signed-nonce-1',
        expected_origins: ['https://verifier.example.com'],
      },
    })
    expect(parsed.signedRequest).toBeDefined()
  })

  test('rejects a signed protocol payload without a compact JAR request string', async () => {
    await expect(parseDcApiIncomingRequest({
      ...unsignedRequest,
      protocol: 'openid4vp-v1-signed',
    }, { trustedVerifiers: [] })).rejects.toThrow(
      'PresentationRequestInvalid: signed dc_api requires a compact JAR, JWS JSON payload, or HTTPS request_uri',
    )
  })

  test('rejects a signed JAR that cannot authenticate against existing verifier trust', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const jar = createSignedJar({
      client_id: clientId,
      response_uri: 'https://untrusted.example.com/oid4vp/response',
      response_mode: 'dc_api',
      nonce: 'signed-nonce-2',
      expected_origins: ['https://untrusted.example.com'],
      dcql_query: unsignedRequest.request.dcql_query,
    }, secretKey)

    await expect(parseDcApiIncomingRequest({
      sessionId: 'dc-session-untrusted',
      protocol: 'openid4vp-v1-signed',
      origin: 'https://untrusted.example.com',
      request: { request: jar },
    }, { trustedVerifiers: [] })).rejects.toThrow(/verifier is not trusted/i)
  })
})

describe('assertSupportedDcApiResponseMode', () => {
  test.each(['dc_api', 'dc_api.jwt'])('accepts %s', (responseMode) => {
    expect(() => assertSupportedDcApiResponseMode(responseMode)).not.toThrow()
  })

  test('rejects direct_post at the parser-owned DC API boundary', () => {
    expect(() => assertSupportedDcApiResponseMode('direct_post')).toThrow(
      'PresentationRequestUnsupported: response_mode direct_post is not supported for DC API',
    )
  })
})
