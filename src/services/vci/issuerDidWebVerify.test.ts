import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { assertIssuerDidWebCredentialSignature } from './issuerDidWebVerify'

if (!hashes.sha512) hashes.sha512 = sha512

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
}

async function signIssuerJwt(input: {
  privateKey: Uint8Array
  payload: Record<string, unknown>
  kid: string
}): Promise<string> {
  const header = encodeJson({ alg: 'EdDSA', typ: 'vc+sd-jwt', kid: input.kid })
  const payload = encodeJson(input.payload)
  const signingInput = `${header}.${payload}`
  const signature = await sign(new TextEncoder().encode(signingInput), input.privateKey)
  return `${signingInput}.${bytesToBase64Url(signature)}`
}

describe('assertIssuerDidWebCredentialSignature', () => {
  const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  const otherPrivateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 2)

  test('skips resolve when iss is https', async () => {
    const fetchMock = jest.fn()
    const jwt = `${encodeJson({ alg: 'EdDSA' })}.${encodeJson({
      iss: 'https://issuer.example.com',
      jti: '1',
    })}.sig`

    await expect(
      assertIssuerDidWebCredentialSignature(jwt, { fetchImpl: fetchMock as unknown as typeof fetch }),
    ).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('resolves did:web and verifies Issuer EdDSA signature', async () => {
    const publicKey = getPublicKey(privateKey)
    const x = bytesToBase64Url(publicKey)
    const iss = 'did:web:issuer.example.com'
    const kid = `${iss}#key-1`
    const jwt = await signIssuerJwt({
      privateKey,
      kid,
      payload: { iss, jti: 'cred-1', vct: 'https://issuer.example.com/vct/id' },
    })

    const fetchMock = jest.fn(async () =>
      Response.json({
        id: iss,
        verificationMethod: [
          {
            id: kid,
            type: 'JsonWebKey2020',
            publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x },
          },
        ],
        assertionMethod: [kid],
      }),
    )

    await expect(
      assertIssuerDidWebCredentialSignature(`${jwt}~`, {
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.example.com/.well-known/did.json',
      expect.objectContaining({
        headers: { Accept: 'application/did+json, application/json' },
      }),
    )
  })

  test('rejects invalid Issuer signature for did:web iss', async () => {
    const iss = 'did:web:issuer.example.com'
    const kid = `${iss}#key-1`
    const jwt = await signIssuerJwt({
      privateKey,
      kid,
      payload: { iss, jti: 'cred-bad' },
    })

    const fetchMock = jest.fn(async () =>
      Response.json({
        id: iss,
        verificationMethod: [
          {
            id: kid,
            type: 'JsonWebKey2020',
            publicKeyJwk: {
              kty: 'OKP',
              crv: 'Ed25519',
              x: bytesToBase64Url(getPublicKey(otherPrivateKey)),
            },
          },
        ],
        assertionMethod: [kid],
      }),
    )

    await expect(
      assertIssuerDidWebCredentialSignature(jwt, {
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('CredentialIssuerSignatureInvalid')
  })
})
