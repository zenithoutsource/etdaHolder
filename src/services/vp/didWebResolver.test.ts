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
})
