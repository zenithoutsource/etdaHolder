import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { parseAuthorizationRequestBody } from '../authorizationRequestJar'
import { parseAuthorizationRequestViaOid4vc } from './parseAuthorizationRequestViaOid4vc'

if (!hashes.sha512) hashes.sha512 = sha512

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function signedRequestJwt(
  payload: Record<string, unknown>,
  privateKey: Uint8Array,
  headerOverrides: Record<string, unknown> = {},
): Promise<string> {
  const publicKey = getPublicKey(privateKey)
  const publicJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncodeBytes(publicKey),
  }
  const header = {
    alg: 'EdDSA',
    typ: 'oauth-authz-req+jwt',
    jwk: publicJwk,
    ...headerOverrides,
  }
  const unsigned = `${encodePart(header)}.${encodePart(payload)}`
  const signature = await sign(new TextEncoder().encode(unsigned), privateKey)

  return `${unsigned}.${base64UrlEncodeBytes(signature)}`
}

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encode(payload)}.`
}

const trustedVerifiers = [
  {
    clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
    name: 'Verifier API',
    allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
  },
]

const requestPayload = {
  response_type: 'vp_token',
  client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
  response_mode: 'direct_post',
  state: 'request-123',
  nonce: 'request-123',
  response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
  dcql_query: {
    credentials: [
      {
        id: 'idcard_credential',
        format: 'jwt_vc_json',
        meta: { type_values: ['IDCardCredential'] },
      },
    ],
  },
}

describe('parseAuthorizationRequestViaOid4vc', () => {
  it('matches legacy parseAuthorizationRequestBody fields for redirect_uri dev fixture', async () => {
    const jwt = unsignedJwt(requestPayload)
    const fetchImpl = jest.fn()

    const adapterResult = await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt },
      { trustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const legacyResult = await parseAuthorizationRequestBody(jwt, { trustedVerifiers })

    expect(adapterResult.authorizationRequest.client_id).toBe(legacyResult?.client_id)
    expect(adapterResult.authorizationRequest.response_uri).toBe(legacyResult?.response_uri)
    expect(adapterResult.authorizationRequest.response_mode).toBe(legacyResult?.response_mode)
    expect(adapterResult.authorizationRequest.nonce).toBe(legacyResult?.nonce)
    expect(adapterResult.authorizationRequest.state).toBe(legacyResult?.state)
    expect(adapterResult.authorizationRequest.dcql_query).toEqual(legacyResult?.dcql_query)
  })

  it('throws PresentationRequestInvalid for untrusted verifier without did.json fetch', async () => {
    const jwt = unsignedJwt(requestPayload)
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))

    await expect(
      parseAuthorizationRequestViaOid4vc(
        { rawBody: jwt },
        {
          trustedVerifiers: [],
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow('PresentationRequestInvalid: verifier is not trusted')

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not perform additional fetch when rawBody material is provided', async () => {
    const jwt = unsignedJwt(requestPayload)
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))

    await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt, requestUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123' },
      { trustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
    )

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('parses by-value inline DCQL params', async () => {
    const result = await parseAuthorizationRequestViaOid4vc(
      {
        byValueParams: {
          response_type: 'vp_token',
          client_id: requestPayload.client_id,
          response_uri: requestPayload.response_uri,
          response_mode: 'direct_post',
          nonce: requestPayload.nonce,
          state: requestPayload.state,
          dcql_query: JSON.stringify(requestPayload.dcql_query),
        },
      },
      { trustedVerifiers },
    )

    expect(result.authorizationRequest.client_id).toBe(requestPayload.client_id)
    expect(result.oid4vcContext.authorizationRequestPayload.response_uri).toBe(requestPayload.response_uri)
  })

  it('verifies signed decentralized_identifier JARs via adapter verifyJwt', async () => {
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 11)
    const publicJwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: base64UrlEncodeBytes(getPublicKey(privateKey)),
    }
    const didPayload = {
      response_type: 'vp_token',
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      response_mode: 'direct_post',
      state: 'did-state',
      nonce: 'did-nonce',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      dcql_query: requestPayload.dcql_query,
    }
    const jwt = await signedRequestJwt(didPayload, privateKey, {
      kid: 'did:web:verifier.example.com#key-1',
      jwk: undefined,
    })
    const didTrustedVerifiers = [
      {
        clientId: 'decentralized_identifier:did:web:verifier.example.com',
        name: 'Trusted Verifier',
        allowedOrigins: ['https://verifier.example.com'],
        verificationJwk: publicJwk,
      },
    ]
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))

    const adapterResult = await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt },
      { trustedVerifiers: didTrustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const legacyResult = await parseAuthorizationRequestBody(jwt, {
      trustedVerifiers: didTrustedVerifiers,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(adapterResult.authorizationRequest.client_id).toBe(legacyResult?.client_id)
    expect(adapterResult.authorizationRequest.nonce).toBe('did-nonce')
    expect(adapterResult.authorizationRequest.dcql_query).toEqual(legacyResult?.dcql_query)
  })
})
