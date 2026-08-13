import {
  readAccessTokenDiagnostics,
  readAccessTokenSafeDiagnostics,
  readProofBindingDiagnostics,
  readProofHeaderBindingDiagnostics,
  readProofJwtDiagnostics,
} from './accessTokenDiagnostics'

function encodePayload(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.sig`
}

describe('accessTokenDiagnostics', () => {
  test('reads jwt exp/aud without throwing', () => {
    const token = encodePayload({
      iss: 'https://issuer.example',
      aud: 'https://issuer.example',
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
    })

    const diagnostics = readAccessTokenDiagnostics(token)

    expect(diagnostics.looksLikeJwt).toBe(true)
    expect(diagnostics.jwtAud).toBe('https://issuer.example')
    expect(diagnostics.secondsUntilExp).toBeGreaterThan(0)
  })

  test('readProofJwtDiagnostics decodes iss/aud/nonce flags', () => {
    const proof = encodePayload({
      iss: 'did:key:z6Mkproof',
      aud: 'https://issuer.example',
      nonce: 'abc123',
    })

    expect(readProofJwtDiagnostics(proof)).toEqual({
      popIss: 'did:key:z6Mkproof',
      popAud: 'https://issuer.example',
      popNoncePresent: true,
    })
  })

  test('readAccessTokenSafeDiagnostics compares audience and confirmation claims', () => {
    const token = encodePayload({
      iss: 'https://issuer.example',
      aud: 'https://issuer.example',
      exp: Math.floor(Date.now() / 1000) + 300,
      cnf: { jkt: 'thumbprint' },
    })

    expect(readAccessTokenSafeDiagnostics(token, 'https://issuer.example', 'https://issuer.example/credential')).toEqual(
      expect.objectContaining({
        compactTokenShape: true,
        audienceMatchesIssuer: true,
        audienceMatchesCredentialEndpoint: false,
        issuerClaimMatchesIssuer: true,
        dpopConfirmationPresent: true,
      }),
    )
  })

  test('readProofBindingDiagnostics compares pop iss to wallet holder did', () => {
    const proof = encodePayload({
      iss: 'did:key:z6Mkholder',
      aud: 'https://issuer.example',
      nonce: 'abc123',
    })

    expect(readProofBindingDiagnostics(proof, 'did:key:z6Mkholder')).toEqual({
      popNoncePresent: true,
      popIssuerMatchesWalletHolder: true,
      popAudiencePresent: true,
      walletHolderDidAvailable: true,
    })
  })

  test('readProofBindingDiagnostics skips holder comparison when wallet key is deferred', () => {
    const proof = encodePayload({
      iss: 'did:key:z6Mkpending',
      aud: 'https://issuer.example',
      nonce: 'abc123',
    })

    expect(readProofBindingDiagnostics(proof)).toEqual({
      popNoncePresent: true,
      popIssuerMatchesWalletHolder: undefined,
      popAudiencePresent: true,
      walletHolderDidAvailable: false,
    })
  })

  test('readProofHeaderBindingDiagnostics reports jwk vs kid without key material', () => {
    const header = Buffer.from(JSON.stringify({
      alg: 'ES256',
      typ: 'openid4vci-proof+jwt',
      jwk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
      cose_key: 'cose',
    })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ aud: 'https://issuer.example', nonce: 'n' })).toString('base64url')
    const proof = `${header}.${body}.sig`

    expect(readProofHeaderBindingDiagnostics(proof)).toEqual({
      popHeaderAlg: 'ES256',
      popHasJwk: true,
      popHasKid: false,
      popHasCoseKey: true,
      popJwkKty: 'EC',
      popJwkCrv: 'P-256',
    })
  })
})
