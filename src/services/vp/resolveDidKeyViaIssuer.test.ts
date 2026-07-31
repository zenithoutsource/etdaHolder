import { resolveDidKeyViaIssuer } from './resolveDidKeyViaIssuer'

describe('resolveDidKeyViaIssuer', () => {
  test('maps Issuer resolveDID response to Ed25519 JWK', async () => {
    const fetchMock = jest.fn(async () =>
      Response.json({
        success: true,
        data: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
      }),
    )

    const jwk = await resolveDidKeyViaIssuer(
      'https://issuer.zenithcomp.co.th:455',
      'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk#z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      fetchMock as unknown as typeof fetch,
    )

    expect(jwk).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.zenithcomp.co.th:455/resolveDID?didKey=did%3Akey%3Az6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    )
  })

  test('rejects invalid resolveDID payloads', async () => {
    const fetchMock = jest.fn(async () =>
      Response.json({ success: false }),
    )

    await expect(
      resolveDidKeyViaIssuer(
        'https://issuer.example.com',
        'did:key:z6Mkissuer',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('ResolveDidInvalidResponse')
  })
})
