import { p256 } from '@noble/curves/nist.js'
import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { p256PublicKeyToDidKey, p256PublicKeyToJwk, signEs256Prehash } from '../crypto/p256Identity'
import { parseAuthorizationRequestBody } from './authorizationRequestJar'

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

function signedEs256RequestJwt(
  payload: Record<string, unknown>,
  secretKey: Uint8Array,
  headerOverrides: Record<string, unknown> = {},
): string {
  const header = {
    alg: 'ES256',
    typ: 'oauth-authz-req+jwt',
    kid: 'verifier-es256-1',
    ...headerOverrides,
  }
  const unsigned = `${encodePart(header)}.${encodePart(payload)}`
  const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
  return `${unsigned}.${base64UrlEncodeBytes(signature)}`
}

describe('authorizationRequestJar', () => {
  const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  const publicJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncodeBytes(getPublicKey(privateKey)),
  }
  const originalDemoInterop = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  afterEach(() => {
    if (originalDemoInterop === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    } else {
      process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalDemoInterop
    }
  })

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

  test('verifies signed redirect_uri ES256 request objects via Verifier JWKS', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const es256Jwk = { ...p256PublicKeyToJwk(publicKey), kid: 'verifier-es256-1', alg: 'ES256' }
    const payload = {
      client_id: 'redirect_uri:https://verifier.example.com:455/openid4vc/verify/request-1',
      response_uri: 'https://verifier.example.com:455/openid4vc/verify/request-1',
      response_mode: 'direct_post',
      nonce: 'nonce-es256',
      dcql_query: { credentials: [] },
    }
    const jwt = signedEs256RequestJwt(payload, secretKey, {
      kid: 'verifier-es256-1',
      jwk: undefined,
    })
    const fetchMock = jest.fn(async () => Response.json({ keys: [es256Jwk] }))

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: 'redirect_uri:https://verifier.example.com:455/openid4vc/verify',
            name: 'Verifier',
            allowedOrigins: ['https://verifier.example.com:455'],
          },
        ],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      nonce: 'nonce-es256',
      client_id: payload.client_id,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com:455/openid4vc/jwks',
      expect.any(Object),
    )
  })

  test('rejects signed bare did:key request objects (OID4VP 1.0 requires prefix)', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const payload = {
      client_id: holderDid,
      response_uri: 'https://verifier.example.com:455/openid4vc/verify/request-1',
      response_mode: 'direct_post',
      nonce: 'nonce-did-key',
      dcql_query: { credentials: [] },
    }
    const jwt = signedEs256RequestJwt(payload, secretKey, {
      kid: `${holderDid}#${holderDid.slice('did:key:'.length)}`,
      jwk: undefined,
    })

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: `decentralized_identifier:${holderDid}`,
            name: 'Did Key Verifier',
            allowedOrigins: ['https://verifier.example.com:455'],
          },
        ],
      }),
    ).rejects.toThrow(
      'OID4VP 1.0 requires client_id "decentralized_identifier:did:…"; bare did: is not supported',
    )
  })

  test('verifies signed decentralized_identifier:did:key ES256 request objects from DID public key', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const clientId = `decentralized_identifier:${holderDid}`
    const payload = {
      client_id: clientId,
      response_uri: 'https://verifier.example.com:455/openid4vc/verify/request-1',
      response_mode: 'direct_post',
      nonce: 'nonce-did-key',
      dcql_query: { credentials: [] },
    }
    const jwt = signedEs256RequestJwt(payload, secretKey, {
      kid: `${holderDid}#${holderDid.slice('did:key:'.length)}`,
      jwk: undefined,
    })

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId,
            name: 'Did Key Verifier',
            allowedOrigins: ['https://verifier.example.com:455'],
          },
        ],
      }),
    ).resolves.toMatchObject({
      nonce: 'nonce-did-key',
      client_id: clientId,
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

  test('verifies signed did:web DC API JARs without response_uri using the platform origin', async () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    const payload = {
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      response_mode: 'dc_api',
      nonce: 'nonce-dc-api',
      expected_origins: ['https://demo.example.com'],
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
        trustedVerifiers: [],
        trustOrigin: 'https://demo.example.com',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      client_id: 'decentralized_identifier:did:web:verifier.example.com',
      expected_origins: ['https://demo.example.com'],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects untrusted decentralized_identifier request before did:web document fetch', async () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

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

  test('rejects signed redirect_uri JARs that embed an attacker JWK instead of the JWKS key', async () => {
    const { secretKey: attackerSecret, publicKey: attackerPublic } = p256.keygen()
    const { publicKey: verifierPublic } = p256.keygen()
    const verifierJwk = { ...p256PublicKeyToJwk(verifierPublic), kid: 'verifier-es256-1', alg: 'ES256' }
    const attackerJwk = { ...p256PublicKeyToJwk(attackerPublic), kid: 'attacker', alg: 'ES256' }
    const payload = {
      client_id: 'redirect_uri:https://verifier.example.com:455/openid4vc/verify/request-1',
      response_uri: 'https://verifier.example.com:455/openid4vc/verify/request-1',
      response_mode: 'direct_post',
      nonce: 'nonce-attacker',
      dcql_query: { credentials: [] },
    }
    const jwt = signedEs256RequestJwt(payload, attackerSecret, {
      kid: 'verifier-es256-1',
      jwk: attackerJwk,
    })
    const fetchMock = jest.fn(async () => Response.json({ keys: [verifierJwk] }))

    await expect(
      parseAuthorizationRequestBody(jwt, {
        trustedVerifiers: [
          {
            clientId: 'redirect_uri:https://verifier.example.com:455/openid4vc/verify',
            name: 'Verifier',
            allowedOrigins: ['https://verifier.example.com:455'],
          },
        ],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/trusted verifier key|signature verification failed/)
    expect(fetchMock).toHaveBeenCalled()
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
