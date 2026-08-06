import { readDidWebDocumentUrl, resolveDidWebVerificationJwk } from './didWebResolver'

describe('didWebResolver', () => {
  test('builds did:web document URLs', () => {
    expect(readDidWebDocumentUrl('did:web:verifier.example.com')).toBe(
      'https://verifier.example.com/.well-known/did.json',
    )
    expect(readDidWebDocumentUrl('did:web:example.com:user:alice')).toBe(
      'https://example.com/user/alice/did.json',
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
})
