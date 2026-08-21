import { p256 } from '@noble/curves/nist.js'
import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { p256PublicKeyToDidKey, p256PublicKeyToJwk, signEs256Prehash } from '@/src/services/crypto/p256Identity'
import { parseAuthorizationRequestBody } from '../authorizationRequestJar'
import { parseAuthorizationRequestViaOid4vc } from './parseAuthorizationRequestViaOid4vc'

if (!hashes.sha512) hashes.sha512 = sha512

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
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

  it('verifies signed redirect_uri ES256 JARs via JWKS then unwraps for adapter', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const es256Jwk = { ...p256PublicKeyToJwk(publicKey), kid: 'verifier-es256-1', alg: 'ES256' }
    const payload = {
      ...requestPayload,
      nonce: 'es256-nonce',
      state: 'es256-state',
    }
    const header = encodePart({
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: 'verifier-es256-1',
    })
    const body = encodePart(payload)
    const unsigned = `${header}.${body}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
    const jwt = `${unsigned}.${base64UrlEncodeBytes(signature)}`
    const fetchImpl = jest.fn(async () => Response.json({ keys: [es256Jwk] }))

    const adapterResult = await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt },
      { trustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const legacyResult = await parseAuthorizationRequestBody(jwt, {
      trustedVerifiers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalled()
    expect(adapterResult.authorizationRequest.nonce).toBe('es256-nonce')
    expect(adapterResult.authorizationRequest.client_id).toBe(legacyResult?.client_id)
    expect(adapterResult.authorizationRequest.dcql_query).toEqual(legacyResult?.dcql_query)
  })

  it('rejects bare did:key client_id (OID4VP 1.0 requires decentralized_identifier prefix)', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const payload = {
      response_type: 'vp_token',
      client_id: holderDid,
      response_mode: 'direct_post',
      state: 'did-key-state',
      nonce: 'did-key-nonce',
      response_uri: 'https://verifier.example.com:455/openid4vc/verify/session-1',
      dcql_query: requestPayload.dcql_query,
      client_metadata: {
        vp_formats_supported: {
          'dc+sd-jwt': {
            'sd-jwt_alg_values': ['EdDSA', 'ES256'],
            'kb-jwt_alg_values': ['EdDSA', 'ES256'],
          },
        },
      },
    }
    const header = encodePart({
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: `${holderDid}#${holderDid.slice('did:key:'.length)}`,
    })
    const body = encodePart(payload)
    const unsigned = `${header}.${body}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
    const jwt = `${unsigned}.${base64UrlEncodeBytes(signature)}`
    const didTrustedVerifiers = [
      {
        clientId: `decentralized_identifier:${holderDid}`,
        name: 'Did Key Verifier',
        allowedOrigins: ['https://verifier.example.com:455'],
      },
    ]

    await expect(
      parseAuthorizationRequestViaOid4vc(
        { rawBody: jwt },
        { trustedVerifiers: didTrustedVerifiers },
      ),
    ).rejects.toThrow(
      'OID4VP 1.0 requires client_id "decentralized_identifier:did:…"; bare did: is not supported',
    )
  })

  it('accepts signed decentralized_identifier:did:key JAR with vp_formats_supported', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const clientId = `decentralized_identifier:${holderDid}`
    const payload = {
      response_type: 'vp_token',
      client_id: clientId,
      response_mode: 'direct_post',
      state: 'did-key-state',
      nonce: 'did-key-nonce',
      response_uri: 'https://verifier.example.com:455/openid4vc/verify/session-1',
      dcql_query: requestPayload.dcql_query,
      client_metadata: {
        vp_formats_supported: {
          'dc+sd-jwt': {
            'sd-jwt_alg_values': ['EdDSA', 'ES256'],
            'kb-jwt_alg_values': ['EdDSA', 'ES256'],
          },
        },
      },
    }
    const header = encodePart({
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: `${holderDid}#${holderDid.slice('did:key:'.length)}`,
    })
    const body = encodePart(payload)
    const unsigned = `${header}.${body}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
    const jwt = `${unsigned}.${base64UrlEncodeBytes(signature)}`
    const didTrustedVerifiers = [
      {
        clientId,
        name: 'Did Key Verifier',
        allowedOrigins: ['https://verifier.example.com:455'],
      },
    ]

    const adapterResult = await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt },
      { trustedVerifiers: didTrustedVerifiers },
    )

    expect(adapterResult.authorizationRequest.client_id).toBe(clientId)
    expect(adapterResult.authorizationRequest.nonce).toBe('did-key-nonce')
    expect(adapterResult.authorizationRequest.dcql_query).toEqual(requestPayload.dcql_query)
  })

  it('rejects signed redirect_uri JARs that verify only against an embedded attacker JWK', async () => {
    const { secretKey: attackerSecret, publicKey: attackerPublic } = p256.keygen()
    const { publicKey: verifierPublic } = p256.keygen()
    const verifierJwk = { ...p256PublicKeyToJwk(verifierPublic), kid: 'verifier-es256-1', alg: 'ES256' }
    const attackerJwk = { ...p256PublicKeyToJwk(attackerPublic), kid: 'attacker', alg: 'ES256' }
    const payload = {
      ...requestPayload,
      nonce: 'attacker-nonce',
      state: 'attacker-state',
    }
    const header = encodePart({
      alg: 'ES256',
      typ: 'oauth-authz-req+jwt',
      kid: 'verifier-es256-1',
      jwk: attackerJwk,
    })
    const body = encodePart(payload)
    const unsigned = `${header}.${body}`
    const signature = signEs256Prehash(new TextEncoder().encode(unsigned), attackerSecret)
    const jwt = `${unsigned}.${base64UrlEncodeBytes(signature)}`
    const fetchImpl = jest.fn(async () => Response.json({ keys: [verifierJwk] }))

    await expect(
      parseAuthorizationRequestViaOid4vc(
        { rawBody: jwt },
        { trustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/PresentationRequestInvalid/)
    expect(fetchImpl).toHaveBeenCalled()
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
