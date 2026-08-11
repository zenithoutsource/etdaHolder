import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToJwk, signEs256Prehash } from './p256Identity'
import { verifyEs256CompactJwt } from './es256JwtVerify'

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

describe('verifyEs256CompactJwt', () => {
  test('verifies compact ES256 JWT against P-256 JWK', () => {
    const { secretKey, publicKey } = p256.keygen()
    const publicJwk = p256PublicKeyToJwk(publicKey)
    const header = encodePart({ alg: 'ES256', typ: 'JWT' })
    const payload = encodePart({ sub: 'test' })
    const signingInput = `${header}.${payload}`
    const signature = signEs256Prehash(new TextEncoder().encode(signingInput), secretKey)
    const jwt = `${signingInput}.${base64UrlEncodeBytes(signature)}`

    expect(verifyEs256CompactJwt(jwt, publicJwk)).toBe(true)
    expect(verifyEs256CompactJwt(jwt, { ...publicJwk, y: publicJwk.x })).toBe(false)
  })

  test('verifies compact ES256 JWT with DER-encoded signature (Java-style)', () => {
    const { secretKey, publicKey } = p256.keygen()
    const publicJwk = p256PublicKeyToJwk(publicKey)
    const header = encodePart({ alg: 'ES256', typ: 'JWT' })
    const payload = encodePart({ sub: 'der-test' })
    const signingInput = `${header}.${payload}`
    const derSignature = p256.sign(new TextEncoder().encode(signingInput), secretKey, {
      prehash: true,
      format: 'der',
      lowS: false,
    })
    expect(derSignature.length).toBeGreaterThan(64)
    const jwt = `${signingInput}.${base64UrlEncodeBytes(derSignature)}`

    expect(verifyEs256CompactJwt(jwt, publicJwk)).toBe(true)
  })

  test('verifies compact ES256 JWT with high-S JOSE signature', () => {
    const { secretKey, publicKey } = p256.keygen()
    const publicJwk = p256PublicKeyToJwk(publicKey)
    const header = encodePart({ alg: 'ES256', typ: 'JWT' })
    const payload = encodePart({ sub: 'high-s' })
    const signingInput = `${header}.${payload}`
    const highS = p256.sign(new TextEncoder().encode(signingInput), secretKey, {
      prehash: true,
      lowS: false,
    })
    const jwt = `${signingInput}.${base64UrlEncodeBytes(highS)}`

    expect(verifyEs256CompactJwt(jwt, publicJwk)).toBe(true)
  })

  test('rejects non-EC JWK', () => {
    expect(
      verifyEs256CompactJwt('a.b.c', {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'x',
      }),
    ).toBe(false)
  })
})
