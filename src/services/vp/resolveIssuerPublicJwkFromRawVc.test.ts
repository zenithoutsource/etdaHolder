import {
  formatVpIssuerPublicKeyEnvLine,
  resolveIssuerPublicJwkFromRawVc,
} from './resolveIssuerPublicJwkFromRawVc'

function base64UrlEncodeJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(value)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

describe('resolveIssuerPublicJwkFromRawVc', () => {
  test('resolves issuer JWK from did:key kid via Issuer resolveDID', async () => {
    const header = base64UrlEncodeJson({
      alg: 'EdDSA',
      typ: 'JWT',
      kid: 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk#z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
    })
    const payload = base64UrlEncodeJson({ iss: 'https://issuer.zenithcomp.co.th:455' })
    const rawVc = `${header}.${payload}.signature~disclosure~`

    const fetchMock = jest.fn(async () =>
      Response.json({
        success: true,
        data: 'F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0',
      }),
    )

    const jwk = await resolveIssuerPublicJwkFromRawVc(rawVc, {
      fetchImpl: fetchMock as unknown as typeof fetch,
    })
    expect(jwk.x).toBe('F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0')
    expect(formatVpIssuerPublicKeyEnvLine(jwk)).toContain('VP_ISSUER_PUBLIC_KEY_JWK=')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.zenithcomp.co.th:455/resolveDID?didKey=did%3Akey%3Az6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      expect.any(Object),
    )
  })
})
