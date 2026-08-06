import {
  didKeyToEd25519PublicJwk,
  formatVpIssuerPublicKeyEnvLine,
  resolveDidKeyViaIssuer,
  resolveVpIssuerPublicKeyFromRawVc,
} from './resolveVpIssuerKey'

describe('resolveVpIssuerKey', () => {
  test('uses the configured HTTPS issuer host when no issuer URL is supplied', async () => {
    const originalIssuerBaseUrl = process.env.ISSUER_BASE_URL
    process.env.ISSUER_BASE_URL = 'https://issuer.zenithcomp.co.th:455'
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'issuer-key' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({})).toString('base64url')

    await expect(resolveVpIssuerPublicKeyFromRawVc(`${header}.${payload}.signature`)).rejects.toThrow('IssuerKeyNotFound')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.zenithcomp.co.th:455/jwks',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )

    fetchMock.mockRestore()
    if (originalIssuerBaseUrl === undefined) delete process.env.ISSUER_BASE_URL
    else process.env.ISSUER_BASE_URL = originalIssuerBaseUrl
  })

  test('derives Ed25519 JWK from issuer did:key kid via Issuer resolveDID', async () => {
    const did = 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk'
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const header = Buffer.from(
      JSON.stringify({
        alg: 'EdDSA',
        typ: 'JWT',
        kid: `${did}#${did.slice('did:key:'.length)}`,
      }),
    ).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: 'https://issuer.zenithcomp.co.th:455' })).toString('base64url')
    const rawVc = `${header}.${payload}.signature~disclosure~`

    const jwk = await resolveVpIssuerPublicKeyFromRawVc(rawVc, 'https://issuer.zenithcomp.co.th:455')
    expect(jwk).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://issuer.zenithcomp.co.th:455/resolveDID?didKey=${encodeURIComponent(did)}`,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(formatVpIssuerPublicKeyEnvLine(jwk)).toBe(
      'VP_ISSUER_PUBLIC_KEY_JWK={"kty":"OKP","crv":"Ed25519","x":"F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0"}',
    )

    fetchMock.mockRestore()
  })

  test('resolveDidKeyViaIssuer maps Issuer resolveDID payload to Ed25519 JWK', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const jwk = await resolveDidKeyViaIssuer(
      'https://issuer.zenithcomp.co.th:455',
      'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
    )
    expect(jwk).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })

    fetchMock.mockRestore()
  })

  test('didKeyToEd25519PublicJwk decodes multibase did:key', () => {
    expect(didKeyToEd25519PublicJwk('did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk')).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })
  })
})
