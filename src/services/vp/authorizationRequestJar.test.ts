import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { parseAuthorizationRequestBody } from './authorizationRequestJar'

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

describe('authorizationRequestJar', () => {
  const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  const publicJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncodeBytes(getPublicKey(privateKey)),
  }

  test('accepts unsigned redirect_uri request objects', async () => {
    const jwt = `${encodePart({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encodePart({
      client_id: 'redirect_uri:https://verifier.example.com/cb',
      response_uri: 'https://verifier.example.com/cb',
    })}.`

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: 'redirect_uri:https://verifier.example.com/cb',
            name: 'Verifier',
            allowedOrigins: ['https://verifier.example.com'],
          },
        ],
      }),
    ).resolves.toMatchObject({
      client_id: 'redirect_uri:https://verifier.example.com/cb',
    })
  })

  test('verifies signed decentralized_identifier request objects with pinned JWK', async () => {
    const payload = {
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      response_mode: 'direct_post',
      nonce: 'nonce-123',
      dcql_query: { credentials: [] },
    }

    const jwt = await signedRequestJwt(payload, privateKey)

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: 'decentralized_identifier:did:web:verifier.example.com',
            name: 'Trusted Verifier',
            allowedOrigins: ['https://verifier.example.com'],
            verificationJwk: publicJwk,
          },
        ],
      }),
    ).resolves.toMatchObject({
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      nonce: 'nonce-123',
    })
  })

  test('resolves signed decentralized_identifier request keys from trusted did:web document', async () => {
    const payload = {
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      response_mode: 'direct_post',
      nonce: 'nonce-123',
      dcql_query: { credentials: [] },
    }
    const jwt = await signedRequestJwt(payload, privateKey, {
      kid: 'did:web:verifier.example.com#key-1',
      jwk: undefined,
    })
    const fetchMock = jest.fn(async () =>
      Response.json({
        id: 'did:web:verifier.example.com',
        verificationMethod: [
          {
            id: 'did:web:verifier.example.com#key-1',
            type: 'JsonWebKey2020',
            publicKeyJwk: publicJwk,
          },
        ],
      }),
    )

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: 'decentralized_identifier:did:web:verifier.example.com',
            name: 'Trusted Verifier',
            allowedOrigins: ['https://verifier.example.com'],
          },
        ],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      nonce: 'nonce-123',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects untrusted decentralized_identifier request before did:web document fetch', async () => {
    const payload = {
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      response_mode: 'direct_post',
      nonce: 'nonce-123',
      dcql_query: { credentials: [] },
    }
    const jwt = await signedRequestJwt(payload, privateKey, {
      kid: 'did:web:verifier.example.com#key-1',
      jwk: undefined,
    })
    const fetchMock = jest.fn()

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('PresentationRequestInvalid: verifier is not trusted')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('rejects unsigned decentralized_identifier request objects', async () => {
    const jwt = `${encodePart({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encodePart({
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
    })}.`

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: 'decentralized_identifier:did:web:verifier.example.com',
            name: 'Trusted Verifier',
            allowedOrigins: ['https://verifier.example.com'],
            verificationJwk: publicJwk,
          },
        ],
      }),
    ).rejects.toThrow('signed request object is required')
  })
})
