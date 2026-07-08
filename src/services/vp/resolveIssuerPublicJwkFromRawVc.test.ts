import {
  formatVpIssuerPublicKeyEnvLine,
  resolveIssuerPublicJwkFromRawVc,
} from './resolveIssuerPublicJwkFromRawVc'

function base64UrlEncodeJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(value)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

describe('resolveIssuerPublicJwkFromRawVc', () => {
  test('derives issuer JWK from did:key kid in rawVc header', () => {
    const header = base64UrlEncodeJson({
      alg: 'EdDSA',
      typ: 'JWT',
      kid: 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk#z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
    })
    const payload = base64UrlEncodeJson({ iss: 'http://192.100.10.46' })
    const rawVc = `${header}.${payload}.signature~disclosure~`

    const jwk = resolveIssuerPublicJwkFromRawVc(rawVc)
    expect(jwk.x).toBe('F_vp5fBKQjTkeNgBNRPHjrsoxJlNjTFUBCPAFVhNYc0')
    expect(formatVpIssuerPublicKeyEnvLine(jwk)).toContain('VP_ISSUER_PUBLIC_KEY_JWK=')
  })
})
