import {
  applyLibDpopState,
  createDpopIssuanceSession,
  createDpopSignJwtCallback,
  getRequestDpopOptions,
} from './dpopIssuanceSession'

describe('dpopIssuanceSession', () => {
  test('creates a P-256 ES256 signer without Keychain', () => {
    const session = createDpopIssuanceSession()

    expect(session.signer.method).toBe('jwk')
    expect(session.signer.alg).toBe('ES256')
    expect(session.signer.publicJwk.kty).toBe('EC')
    expect(session.signer.publicJwk.crv).toBe('P-256')
  })

  test('signJwt callback signs dpop+jwt without holder PoP alg', async () => {
    const session = createDpopIssuanceSession()
    const signJwt = createDpopSignJwtCallback(session)

    const result = await signJwt(session.signer, {
      header: {
        alg: 'ES256',
        typ: 'dpop+jwt',
        jwk: session.signer.publicJwk,
      },
      payload: {
        htu: 'https://issuer.example.com/token',
        htm: 'POST',
        iat: 1_700_000_000,
        jti: 'test-jti',
      },
    })

    expect(result.jwt.split('.')).toHaveLength(3)
    expect(result.signerJwk).toEqual(session.publicJwk)
  })

  test('rejects non-dpop signJwt requests', async () => {
    const session = createDpopIssuanceSession()
    const signJwt = createDpopSignJwtCallback(session)

    await expect(
      signJwt(session.signer, {
        header: { alg: 'ES256', typ: 'JWT' },
        payload: { iss: 'wallet', aud: 'issuer' },
      }),
    ).rejects.toThrow('DpopSignJwtUnsupported')
  })

  test('applies lib-returned nonce to session state', () => {
    const session = createDpopIssuanceSession()
    applyLibDpopState(session, {
      signer: session.signer,
      nonce: 'server-nonce',
    })

    expect(getRequestDpopOptions(session)).toEqual({
      signer: session.signer,
      nonce: 'server-nonce',
    })
  })
})
