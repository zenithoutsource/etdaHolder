import { p256 } from '@noble/curves/nist.js'

import { createMockHardwareEcdsaSigner } from './hardwareEcdsaSigner.mock'
import {
  encodeP256CoseKeyBase64Url,
  signEs256Jwt,
  signHardwareHolderStatusChangePop,
  signHardwareProofJwt,
  signHardwareSdJwtKbPresentationToken,
} from './hardwareJwtSigner'
import { p256JwkToPublicKey, p256PublicKeyToDidKey, p256PublicKeyToJwk, signEs256Prehash, verifyEs256Prehash } from './p256Identity'

function decodeJwtPart(part: string): Record<string, unknown> {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

describe('hardwareJwtSigner', () => {
  test('encodeP256CoseKeyBase64Url produces non-empty COSE key', () => {
    const { publicKey } = p256.keygen()
    const encoded = encodeP256CoseKeyBase64Url(publicKey)
    expect(encoded.length).toBeGreaterThan(40)
  })

  test('signEs256Jwt returns verifiable 3-part JWT with alg ES256', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const jwt = await signEs256Jwt(
      { alg: 'ES256', typ: 'JWT' },
      { aud: 'https://issuer.example.com', iat: 1 },
      async (message) => signEs256Prehash(message, secretKey),
      'test',
    )

    const [headerB64, payloadB64, signatureB64] = jwt.split('.')
    expect(decodeJwtPart(headerB64!).alg).toBe('ES256')

    const signingInput = `${headerB64}.${payloadB64}`
    const signature = Uint8Array.from(
      atob(signatureB64!.replace(/-/g, '+').replace(/_/g, '/')),
      (char) => char.charCodeAt(0),
    )
    expect(verifyEs256Prehash(new TextEncoder().encode(signingInput), signature, publicKey)).toBe(true)
  })

  test('signHardwareProofJwt supports did-kid and jwk bindings', async () => {
    const store = new Map()
    const signer = createMockHardwareEcdsaSigner(store)
    const created = await signer.createKey('pending.test')
    const publicJwk = created.publicJwk
    const holderDid = p256PublicKeyToDidKey(p256JwkToPublicKey(publicJwk))
    const session = await signer.openSigningSession('pending.test', { purpose: 'oid4vci', maxSignatures: 4 })

    try {
      const didKidJwt = await signHardwareProofJwt({
        nonce: 'nonce-1',
        audience: 'https://issuer.example.com',
        keyBinding: 'did-kid',
        publicJwk,
        holderDid,
        sign: (message) => session.sign(message),
      })
      const didKidHeader = decodeJwtPart(didKidJwt.split('.')[0]!)
      const didKidPayload = decodeJwtPart(didKidJwt.split('.')[1]!)
      expect(didKidHeader.alg).toBe('ES256')
      expect(didKidHeader.typ).toBe('openid4vci-proof+jwt')
      expect(didKidHeader.kid).toContain(holderDid)
      expect(didKidPayload).toMatchObject({
        aud: 'https://issuer.example.com',
        nonce: 'nonce-1',
      })
      expect(didKidPayload).not.toHaveProperty('iss')
      expect(didKidPayload).not.toHaveProperty('sub')

      const jwkJwt = await signHardwareProofJwt({
        nonce: 'nonce-2',
        audience: 'https://issuer.example.com',
        keyBinding: 'jwk',
        publicJwk,
        holderDid,
        sign: (message) => session.sign(message),
      })
      const jwkHeader = decodeJwtPart(jwkJwt.split('.')[0]!)
      expect(jwkHeader.jwk).toMatchObject({
        kty: 'EC',
        crv: 'P-256',
        x: publicJwk.x,
        y: publicJwk.y,
      })
      expect(jwkHeader.kid).toBeUndefined()
      expect(jwkHeader.cose_key).toBeUndefined()

      const jwkKidJwt = await signHardwareProofJwt({
        nonce: 'nonce-2b',
        audience: 'https://issuer.zenithcomp.co.th:455',
        keyBinding: 'jwk-kid',
        publicJwk,
        holderDid,
        sign: (message) => session.sign(message),
      })
      const jwkKidHeader = decodeJwtPart(jwkKidJwt.split('.')[0]!)
      expect(jwkKidHeader.jwk).toMatchObject({
        kty: 'EC',
        crv: 'P-256',
        x: publicJwk.x,
        y: publicJwk.y,
      })
      expect(jwkKidHeader.kid).toContain(holderDid)
      expect(jwkKidHeader.cose_key).toBeUndefined()

      const defaultJwt = await signHardwareProofJwt({
        nonce: 'nonce-3',
        audience: 'https://issuer.example.com',
        publicJwk,
        holderDid,
        sign: (message) => session.sign(message),
      })
      const defaultHeader = decodeJwtPart(defaultJwt.split('.')[0]!)
      expect(defaultHeader.jwk).toMatchObject({ kty: 'EC', crv: 'P-256' })
      expect(defaultHeader.kid).toBeUndefined()
    } finally {
      await session.close()
    }
  })

  test('signHardwareSdJwtKbPresentationToken matches eudi-dev kb+jwt header (alg and typ only)', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const jwk = p256PublicKeyToJwk(publicKey)
    const kid = `${holderDid}#${holderDid.slice('did:key:'.length)}`
    const sdJwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.sig~'

    const presentation = await signHardwareSdJwtKbPresentationToken({
      audience: 'https://verifier.example.com',
      nonce: 'vp-nonce',
      sdJwt,
      holderDid,
      kid,
      publicJwk: jwk,
      sign: async (message) => signEs256Prehash(message, secretKey),
    })

    expect(presentation.startsWith(sdJwt)).toBe(true)
    const kbHeader = decodeJwtPart(presentation.split('~').at(-1)!.split('.')[0]!)
    expect(kbHeader).toEqual({ alg: 'ES256', typ: 'kb+jwt' })
    const kbPayload = decodeJwtPart(presentation.split('~').at(-1)!.split('.')[1]!)
    expect(kbPayload.aud).toBe('https://verifier.example.com')
    expect(kbPayload.nonce).toBe('vp-nonce')
    expect(kbPayload.sd_hash).toBeTruthy()
    expect(kbPayload.iat).toEqual(expect.any(Number))
  })

  test('signHardwareSdJwtKbPresentationToken omits optional kid and jwk', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const jwk = p256PublicKeyToJwk(publicKey)
    const sdJwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.sig~'

    const presentation = await signHardwareSdJwtKbPresentationToken({
      audience: 'https://verifier.example.com',
      nonce: 'vp-nonce',
      sdJwt,
      holderDid: p256PublicKeyToDidKey(publicKey),
      kid: undefined,
      sign: async (message) => signEs256Prehash(message, secretKey),
    })

    const kbHeader = decodeJwtPart(presentation.split('~').at(-1)!.split('.')[0]!)
    expect(kbHeader.kid).toBeUndefined()
    expect(kbHeader.jwk).toBeUndefined()
  })

  test('signHardwareSdJwtKbPresentationToken preserves SD-JWT disclosure segments', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const jwk = p256PublicKeyToJwk(publicKey)
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const kid = `${holderDid}#${holderDid.slice('did:key:'.length)}`
    const disclosureA = 'WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ'
    const disclosureB = 'WyJzYWx0LWFnZSIsImFnZSIsMjVd'
    const sdJwt = `eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.sig~${disclosureA}~${disclosureB}`

    const presentation = await signHardwareSdJwtKbPresentationToken({
      audience: 'https://verifier.example.com',
      nonce: 'vp-nonce',
      sdJwt,
      holderDid,
      kid,
      publicJwk: jwk,
      sign: async (message) => signEs256Prehash(message, secretKey),
    })

    const segments = presentation.split('~')
    expect(segments[0]).toBe('eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.sig')
    expect(segments[1]).toBe(disclosureA)
    expect(segments[2]).toBe(disclosureB)
    expect(segments[3]?.split('.').length).toBe(3)
    expect(decodeJwtPart(segments[3]!.split('.')[0]!).typ).toBe('kb+jwt')
  })

  test('signHardwareHolderStatusChangePop uses holder-status-change+jwt typ', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const holderDid = p256PublicKeyToDidKey(publicKey)
    const kid = `${holderDid}#${holderDid.slice('did:key:'.length)}`

    const jwt = await signHardwareHolderStatusChangePop({
      nonce: 'revoke-nonce',
      audience: 'https://issuer.example.com',
      credentialId: 'cred-1',
      holderDid,
      kid,
      sign: async (message) => signEs256Prehash(message, secretKey),
    })

    const header = decodeJwtPart(jwt.split('.')[0]!)
    expect(header.alg).toBe('ES256')
    expect(header.typ).toBe('holder-status-change+jwt')
  })
})
