import { createOid4vcCallbacks } from './oid4vcCallbacks'

describe('oid4vcCallbacks', () => {
  it('throws PresentationRequestUnsupported from decryptJwe', async () => {
    const callbacks = createOid4vcCallbacks()
    await expect(callbacks.decryptJwe('jwe.token')).rejects.toThrow(
      'PresentationRequestUnsupported: JWE decryption is not supported in Phase 1',
    )
  })

  it('throws PresentationRequestUnsupported from getX509CertificateMetadata', () => {
    const callbacks = createOid4vcCallbacks()
    expect(() => callbacks.getX509CertificateMetadata?.('cert')).toThrow(
      'PresentationRequestUnsupported: X.509 client identifiers are not supported in Phase 1',
    )
  })

  it('throws PresentationRequestUnsupported from signJwt', async () => {
    const callbacks = createOid4vcCallbacks()
    await expect(
      callbacks.signJwt(
        { method: 'jwk', alg: 'EdDSA', publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'abc' } },
        { header: { alg: 'EdDSA' }, payload: {} },
      ),
    ).rejects.toThrow('PresentationRequestUnsupported: JWT signing is not supported in Phase 1 adapter callbacks')
  })

  it('uses injected fetchImpl', async () => {
    const fetchImpl = jest.fn()
    const callbacks = createOid4vcCallbacks({ fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(callbacks.fetch).toBe(fetchImpl)
  })
})
