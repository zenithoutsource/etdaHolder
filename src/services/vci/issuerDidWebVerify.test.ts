import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { assertIssuerDidWebCredentialSignature } from './issuerDidWebVerify'

if (!hashes.sha512) hashes.sha512 = sha512

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const byte of bytes) n = (n << 8n) | BigInt(byte)
  return n
}

function base58btcEncode(bytes: Uint8Array): string {
  let leadingOnes = 0
  for (const byte of bytes) {
    if (byte !== 0) break
    leadingOnes += 1
  }

  let n = bytesToBigInt(bytes)
  let result = ''
  while (n > 0n) {
    const rem = Number(n % 58n)
    result = BASE58_ALPHABET[rem] + result
    n /= 58n
  }

  return '1'.repeat(leadingOnes) + result
}

function ed25519DidKeyFromPrivateKey(privateKey: Uint8Array): string {
  const publicKey = getPublicKey(privateKey)
  const multicodecBytes = new Uint8Array(34)
  multicodecBytes[0] = 0xed
  multicodecBytes[1] = 0x01
  multicodecBytes.set(publicKey, 2)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

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

  test('skips resolve when iss is https without did:key kid', async () => {
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

  test('resolves HTTPS iss via resolveDID when kid is did:key and verifies signature', async () => {
    const publicKey = getPublicKey(privateKey)
    const x = bytesToBase64Url(publicKey)
    const iss = 'https://issuer.zenithcomp.co.th:455'
    const did = ed25519DidKeyFromPrivateKey(privateKey)
    const kid = `${did}#${did.slice('did:key:'.length)}`
    const jwt = await signIssuerJwt({
      privateKey,
      kid,
      payload: { iss, jti: 'cred-https' },
    })

    const fetchMock = jest.fn(async () =>
      Response.json({ success: true, data: x }),
    )

    await expect(
      assertIssuerDidWebCredentialSignature(`${jwt}~`, {
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      `https://issuer.zenithcomp.co.th:455/resolveDID?didKey=${encodeURIComponent(did)}`,
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    )
  })

  test('verifies HTTPS iss with did:key kid using local fallback when resolveDID fails', async () => {
    const iss = 'https://issuer.zenithcomp.co.th:455'
    const did = ed25519DidKeyFromPrivateKey(privateKey)
    const kid = `${did}#${did.slice('did:key:'.length)}`
    const jwt = await signIssuerJwt({
      privateKey,
      kid,
      payload: { iss, jti: 'cred-https-fallback' },
    })

    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })

    await expect(
      assertIssuerDidWebCredentialSignature(`${jwt}~`, {
        fetchImpl: fetchMock as unknown as typeof fetch,
        issuerBaseUrl: iss,
        issuerMetadata: {
          token_endpoint: 'http://issuer.zenithcomp.co.th:455/token',
        },
      }),
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalled()
  })

  test('rejects invalid Issuer signature for HTTPS iss with did:key kid', async () => {
    const iss = 'https://issuer.zenithcomp.co.th:455'
    const did = 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk'
    const kid = `${did}#z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk`
    const jwt = await signIssuerJwt({
      privateKey,
      kid,
      payload: { iss, jti: 'cred-bad-https' },
    })

    const fetchMock = jest.fn(async () =>
      Response.json({
        success: true,
        data: bytesToBase64Url(getPublicKey(otherPrivateKey)),
      }),
    )

    await expect(
      assertIssuerDidWebCredentialSignature(jwt, {
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('CredentialIssuerSignatureInvalid')
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
