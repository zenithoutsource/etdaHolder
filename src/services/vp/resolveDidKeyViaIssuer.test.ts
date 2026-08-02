import { didKeyToEd25519PublicJwk } from './didKeyPublicJwk'
import {
  readIssuerResolveBaseUrls,
  resolveDidKeyPublicJwk,
  resolveDidKeyViaIssuer,
} from './resolveDidKeyViaIssuer'

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
    const fetchMock = jest.fn(async () => Response.json({ success: false }))

    await expect(
      resolveDidKeyViaIssuer(
        'https://issuer.example.com',
        'did:key:z6Mkissuer',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('ResolveDidInvalidResponse')
  })

  test('falls back to local did:key decode when resolveDID network fails', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })

    const jwk = await resolveDidKeyPublicJwk(
      'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      {
        issuerUrls: ['https://issuer.zenithcomp.co.th:455'],
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    )

    expect(jwk.x).toBe('F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0')
    expect(fetchMock).toHaveBeenCalled()
  })

  test('prefers HTTPS JWT iss before HTTP token_endpoint origin', () => {
    expect(
      readIssuerResolveBaseUrls('https://issuer.zenithcomp.co.th:455', undefined, {
        token_endpoint: 'http://issuer.zenithcomp.co.th:455/token',
      }),
    ).toEqual([
      'https://issuer.zenithcomp.co.th:455',
      'http://issuer.zenithcomp.co.th:455',
    ])
  })
})

describe('didKeyToEd25519PublicJwk', () => {
  test('decodes multibase did:key', () => {
    expect(
      didKeyToEd25519PublicJwk('did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk'),
    ).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })
  })
})
