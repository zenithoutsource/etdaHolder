import {
  didKeyToEd25519PublicJwk,
  formatVpIssuerPublicKeyEnvLine,
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

  test('derives Ed25519 JWK from issuer did:key kid in rawVc header', async () => {
    const header = Buffer.from(
      JSON.stringify({
        alg: 'EdDSA',
        typ: 'JWT',
        kid: 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk#z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      }),
    ).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: 'http://issuer.zenithcomp.co.th:455' })).toString('base64url')
    const rawVc = `${header}.${payload}.signature~disclosure~`

    const jwk = await resolveVpIssuerPublicKeyFromRawVc(rawVc)
    expect(jwk).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })
    expect(formatVpIssuerPublicKeyEnvLine(jwk)).toBe(
      'VP_ISSUER_PUBLIC_KEY_JWK={"kty":"OKP","crv":"Ed25519","x":"F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0"}',
    )
  })

  test('didKeyToEd25519PublicJwk decodes multibase did:key', () => {
    expect(didKeyToEd25519PublicJwk('did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk')).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
    })
  })
})
