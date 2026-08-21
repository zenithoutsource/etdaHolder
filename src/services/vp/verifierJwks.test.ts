import { readVerifierJwksUrl, resolveJwkFromVerifierJwks } from './verifierJwks'

describe('verifierJwks', () => {
  test('readVerifierJwksUrl joins response_uri origin with JWKS path', () => {
    expect(
      readVerifierJwksUrl(
        'https://verifier.example.com:455/openid4vc/verify/session-1',
        '/openid4vc/jwks',
      ),
    ).toBe('https://verifier.example.com:455/openid4vc/jwks')
  })

  test('resolveJwkFromVerifierJwks selects key by kid', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json({
        keys: [
          {
            kty: 'EC',
            crv: 'P-256',
            x: 'x1',
            y: 'y1',
            kid: 'other',
            alg: 'ES256',
          },
          {
            kty: 'EC',
            crv: 'P-256',
            x: 'x2',
            y: 'y2',
            kid: 'verifier-es256-1',
            alg: 'ES256',
          },
        ],
      }),
    )

    await expect(
      resolveJwkFromVerifierJwks({
        responseUri: 'https://verifier.example.com:455/openid4vc/verify/session-1',
        kid: 'verifier-es256-1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      kid: 'verifier-es256-1',
      x: 'x2',
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://verifier.example.com:455/openid4vc/jwks',
      expect.objectContaining({
        headers: { Accept: 'application/jwk-set+json, application/json' },
      }),
    )
  })

  test('resolveJwkFromVerifierJwks rejects missing kid', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json({
        keys: [
          {
            kty: 'EC',
            crv: 'P-256',
            x: 'x1',
            y: 'y1',
            kid: 'other',
            alg: 'ES256',
          },
        ],
      }),
    )

    await expect(
      resolveJwkFromVerifierJwks({
        responseUri: 'https://verifier.example.com:455/openid4vc/verify/session-1',
        kid: 'missing',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('verifier signing key kid not found in JWKS')
  })
})
