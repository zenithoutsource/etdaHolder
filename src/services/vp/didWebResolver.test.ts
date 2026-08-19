import { getPublicKey, hashes } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { base58btcEncode } from '../crypto/p256Identity'
import { didKeyToEd25519PublicJwk } from './didKeyPublicJwk'
import { readDidWebDocumentUrl, resolveDidWebVerificationJwk } from './didWebResolver'

if (!hashes.sha512) hashes.sha512 = sha512

function ed25519MulticodecMultibase(publicKey: Uint8Array): string {
  const multicodecBytes = new Uint8Array(34)
  multicodecBytes[0] = 0xed
  multicodecBytes[1] = 0x01
  multicodecBytes.set(publicKey, 2)
  return `z${base58btcEncode(multicodecBytes)}`
}

describe('didWebResolver', () => {
  test('builds did:web document URLs', () => {
    expect(readDidWebDocumentUrl('did:web:verifier.example.com')).toBe(
      'https://verifier.example.com/.well-known/did.json',
    )
    expect(readDidWebDocumentUrl('did:web:example.com:user:alice')).toBe(
      'https://example.com/user/alice/did.json',
    )
    expect(readDidWebDocumentUrl('did:web:issuer.zenithcomp.co.th%3A455')).toBe(
      'https://issuer.zenithcomp.co.th:455/.well-known/did.json',
    )
  })

  test('resolves verification JWK from did:web document', async () => {
    const fetchMock = jest.fn(async () =>
      Response.json({
        id: 'did:web:verifier.example.com',
        verificationMethod: [
          {
            id: 'did:web:verifier.example.com#key-1',
            type: 'JsonWebKey2020',
            publicKeyJwk: {
              kty: 'OKP',
              crv: 'Ed25519',
              x: 'abc',
            },
          },
        ],
        assertionMethod: ['did:web:verifier.example.com#key-1'],
      }),
    )

    await expect(
      resolveDidWebVerificationJwk(
        'did:web:verifier.example.com',
        'did:web:verifier.example.com#key-1',
        fetchMock as unknown as typeof fetch,
      ),
    ).resolves.toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'abc',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com/.well-known/did.json',
      expect.objectContaining({ headers: { Accept: 'application/did+json, application/json' } }),
    )
  })

  test('rejects timed out did:web document fetches', async () => {
    const fetchMock = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )

    await expect(
      resolveDidWebVerificationJwk(
        'did:web:verifier.example.com',
        undefined,
        fetchMock as unknown as typeof fetch,
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow('DidWebResolveFailed: fetch timed out')
  })

  test('rejects oversized did:web document byte bodies', async () => {
    const fetchMock = jest.fn(async () => new Response('{"id":"did:web:verifier.example.com"}'))

    await expect(
      resolveDidWebVerificationJwk(
        'did:web:verifier.example.com',
        undefined,
        fetchMock as unknown as typeof fetch,
        { maxBytes: 4 },
      ),
    ).rejects.toThrow('DidWebResolveFailed: response exceeds max bytes')
  })

  test('keeps malformed did:web identifiers in DidWebInvalid error family', () => {
    expect(() => readDidWebDocumentUrl('did:web:%zz')).toThrow(
      'DidWebInvalid: malformed did:web identifier',
    )
  })

  test('resolves Ed25519VerificationKey2020 publicKeyMultibase to JWK', async () => {
    const publicKey = getPublicKey(Uint8Array.from({ length: 32 }, (_, index) => index + 1))
    const multibase = ed25519MulticodecMultibase(publicKey)
    const iss = 'did:web:issuer.zenithcomp.co.th%3A455'
    const kid = `${iss}#key-1`
    const fetchMock = jest.fn(async () =>
      Response.json({
        id: iss,
        verificationMethod: [
          {
            id: kid,
            type: 'Ed25519VerificationKey2020',
            controller: iss,
            publicKeyMultibase: multibase,
          },
        ],
        assertionMethod: [kid],
      }),
    )

    await expect(
      resolveDidWebVerificationJwk(iss, kid, fetchMock as unknown as typeof fetch),
    ).resolves.toEqual(didKeyToEd25519PublicJwk(`did:key:${multibase}`))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.zenithcomp.co.th:455/.well-known/did.json',
      expect.objectContaining({
        headers: { Accept: 'application/did+json, application/json' },
      }),
    )
  })

  test('resolves the published issuer publicKeyMultibase document', async () => {
    const iss = 'did:web:issuer.zenithcomp.co.th%3A455'
    const kid = `${iss}#key-1`
    const multibase = 'z6MkekdATev6AMpP9hfyLcUSQGLYgmKPH917h3ubMuVMyVTf'
    const fetchMock = jest.fn(async () =>
      Response.json({
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/ed25519-2020/v1',
        ],
        id: iss,
        verificationMethod: [
          {
            id: kid,
            type: 'Ed25519VerificationKey2020',
            controller: iss,
            publicKeyMultibase: multibase,
          },
        ],
        authentication: [kid],
        assertionMethod: [kid],
      }),
    )

    await expect(
      resolveDidWebVerificationJwk(iss, kid, fetchMock as unknown as typeof fetch),
    ).resolves.toEqual(didKeyToEd25519PublicJwk(`did:key:${multibase}`))
  })

  test('prefers publicKeyJwk when both encodings are present', async () => {
    const fetchMock = jest.fn(async () =>
      Response.json({
        id: 'did:web:issuer.example.com',
        verificationMethod: [
          {
            id: 'did:web:issuer.example.com#key-1',
            type: 'Ed25519VerificationKey2020',
            publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'from-jwk' },
            publicKeyMultibase: 'z6MkekdATev6AMpP9hfyLcUSQGLYgmKPH917h3ubMuVMyVTf',
          },
        ],
      }),
    )

    await expect(
      resolveDidWebVerificationJwk(
        'did:web:issuer.example.com',
        'did:web:issuer.example.com#key-1',
        fetchMock as unknown as typeof fetch,
      ),
    ).resolves.toEqual({ kty: 'OKP', crv: 'Ed25519', x: 'from-jwk' })
  })

  test('rejects unsupported publicKeyMultibase', async () => {
    const fetchMock = jest.fn(async () =>
      Response.json({
        id: 'did:web:issuer.example.com',
        verificationMethod: [
          {
            id: 'did:web:issuer.example.com#key-1',
            type: 'Ed25519VerificationKey2020',
            publicKeyMultibase: 'zbad',
          },
        ],
      }),
    )

    await expect(
      resolveDidWebVerificationJwk(
        'did:web:issuer.example.com',
        'did:web:issuer.example.com#key-1',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('DidWebResolveFailed:')
  })
})
