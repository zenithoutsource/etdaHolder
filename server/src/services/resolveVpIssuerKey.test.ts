import {
  didKeyToEd25519PublicJwk,
  formatVpIssuerPublicKeyEnvLine,
  resolveVpIssuerPublicKeyFromRawVc,
} from './resolveVpIssuerKey'

describe('resolveVpIssuerKey', () => {
  test('derives Ed25519 JWK from issuer did:key kid in rawVc header', async () => {
    const header = Buffer.from(
      JSON.stringify({
        alg: 'EdDSA',
        typ: 'JWT',
        kid: 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk#z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      }),
    ).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: 'http://192.100.10.46' })).toString('base64url')
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
