import {
  generateKeypair,
  getPublicBytesForKeyId,
  sign,
} from '@animo-id/expo-secure-environment'
import { ed25519 } from '@noble/curves/ed25519.js'

import {
  generateWalletKeyIfNeeded,
  getPublicKeyJwk,
  signSdJwtKbPresentationToken,
  signSoftwareEddsaSdJwtKbPresentationToken,
  getHolderDid,
  signPresentationVpToken,
  signProof,
} from './crypto'
import { getMetaStorage } from '../storage/storage'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const P256_DID_KEY_VECTOR = 'did:key:zDnaerx9CtbPJ1q36T5Ln5wYt3MQYeGRG5ehnPAmxcf5mDZpv'

function base58btcDecode(value: string): Uint8Array {
  let n = 0n
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`invalid base58 char ${char}`)
    n = n * 58n + BigInt(index)
  }

  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }

  for (const char of value) {
    if (char !== '1') break
    bytes.unshift(0)
  }

  return new Uint8Array(bytes)
}

function p256CompressedKeyFromDidKey(did: string): Uint8Array {
  const fingerprint = did.replace('did:key:z', '')
  const multicodecBytes = base58btcDecode(fingerprint)
  expect(Array.from(multicodecBytes.slice(0, 2))).toEqual([0x80, 0x24])
  return multicodecBytes.slice(2)
}

function base64UrlDecode(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(value))) as Record<string, unknown>
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlEncode(input: unknown): string {
  return btoa(JSON.stringify(input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function unsignedJwt(payload: Record<string, unknown>): string {
  return `${base64UrlEncode({ alg: 'none', typ: 'vc+sd-jwt' })}.${base64UrlEncode(payload)}.`
}

function getPublicKeyFromOkpHeader(header: Record<string, unknown>): Uint8Array {
  const jwk = header.jwk as Record<string, unknown> | undefined
  expect(jwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519' })
  expect(typeof jwk?.x).toBe('string')
  return base64UrlDecodeBytes(jwk?.x as string)
}

describe('wallet did:key crypto service', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
  const originalSoftwareEddsaFlag = process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING

  beforeEach(() => {
    getMetaStorage().clearAll()
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
    delete process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = originalSoftwareEddsaFlag
  })

  test('derives Holder DID from compressed P-256 did:key bytes', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))

    await generateWalletKeyIfNeeded()

    expect(generateKeypair).toHaveBeenCalledWith('etda_wallet_signing_key', true)
    expect(getHolderDid()).toBe(P256_DID_KEY_VECTOR)
  })

  test('signs PoP JWT with Holder DID issuer and did:key verification method kid', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))
    jest.mocked(sign).mockResolvedValue(new Uint8Array(64).fill(7))

    await generateWalletKeyIfNeeded()
    const jwt = await signProof('nonce-123', 'https://issuer.example.com')
    const [encodedHeader, encodedPayload] = jwt.split('.')

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'ES256',
      typ: 'openid4vci-proof+jwt',
      kid: `${P256_DID_KEY_VECTOR}#${P256_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(base64UrlDecode(encodedPayload)).toMatchObject({
      iss: P256_DID_KEY_VECTOR,
      aud: 'https://issuer.example.com',
      nonce: 'nonce-123',
    })
    expect(sign).toHaveBeenCalledWith(
      'etda_wallet_signing_key',
      expect.any(Uint8Array),
      true,
    )
  })

  test('signs OID4VCI PoP JWT with development-only software EdDSA when enabled', async () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'

    const jwt = await signProof('nonce-123', 'https://issuer.example.com')
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.')
    const header = base64UrlDecode(encodedHeader)
    const payload = base64UrlDecode(encodedPayload)
    const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    const signature = base64UrlDecodeBytes(encodedSignature)

    expect(header).toMatchObject({
      alg: 'EdDSA',
      typ: 'openid4vci-proof+jwt',
    })
    expect(typeof header.kid).toBe('string')
    expect(String(header.kid)).toMatch(/^did:key:z6Mk.+#z6Mk.+/)
    expect(payload).toMatchObject({
      iss: String(header.kid).split('#')[0],
      sub: String(header.kid).split('#')[0],
      aud: 'https://issuer.example.com',
      nonce: 'nonce-123',
    })
    expect(ed25519.verify(signature, signingInput, getPublicKeyFromOkpHeader(header))).toBe(true)
    expect(sign).not.toHaveBeenCalled()
  })

  test('uses the software Ed25519 DID as holder DID when development EdDSA is enabled', () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'

    const holderDid = getHolderDid()
    const publicJwk = getPublicKeyJwk()

    expect(holderDid).toMatch(/^did:key:z6Mk.+/)
    expect(publicJwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519' })
  })

  test('signs OID4VP JWT VP token with nonce, audience, and embedded credential', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))
    jest.mocked(sign).mockResolvedValue(new Uint8Array(64).fill(8))

    await generateWalletKeyIfNeeded()
    const jwt = await signPresentationVpToken({
      audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      verifiableCredential: 'issuer.vc.jwt',
    })
    const [encodedHeader, encodedPayload] = jwt.split('.')
    const payload = base64UrlDecode(encodedPayload)

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'ES256',
      typ: 'JWT',
      kid: `${P256_DID_KEY_VECTOR}#${P256_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(payload).toMatchObject({
      iss: P256_DID_KEY_VECTOR,
      sub: P256_DID_KEY_VECTOR,
      aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      vp: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: ['issuer.vc.jwt'],
      },
    })
    expect(typeof payload.jti).toBe('string')
    expect(typeof payload.nbf).toBe('number')
    expect(typeof payload.exp).toBe('number')
  })

  test('signs SD-JWT+KB presentation token with nonce, audience, and sd_hash', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))
    jest.mocked(sign).mockResolvedValue(new Uint8Array(64).fill(9))

    await generateWalletKeyIfNeeded()
    const holderJwk = getPublicKeyJwk()
    const sdJwt = `${unsignedJwt({
      iss: 'https://issuer.example.com',
      vct: 'https://issuer.example.com/credentials/TranscriptCredential',
      cnf: { jwk: holderJwk },
    })}~disclosure~`
    const presentation = await signSdJwtKbPresentationToken({
      audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      sdJwt,
    })

    expect(presentation.startsWith(sdJwt)).toBe(true)
    const kbJwt = presentation.slice(sdJwt.length)
    const [encodedHeader, encodedPayload] = kbJwt.split('.')
    const payload = base64UrlDecode(encodedPayload)

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'ES256',
      typ: 'kb+jwt',
      kid: `${P256_DID_KEY_VECTOR}#${P256_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(payload).toMatchObject({
      aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
    })
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.sd_hash).toBe('string')
    expect(sign).toHaveBeenCalledWith(
      'etda_wallet_signing_key',
      expect.any(Uint8Array),
      true,
    )
  })

  test('rejects SD-JWT+KB signing when the credential is not holder-bound to the wallet key', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))

    await generateWalletKeyIfNeeded()
    const sdJwt = `${unsignedJwt({
      iss: 'https://issuer.example.com',
      vct: 'https://issuer.example.com/credentials/TranscriptCredential',
    })}~disclosure~`

    await expect(
      signSdJwtKbPresentationToken({
        audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
        nonce: 'request-123',
        sdJwt,
      }),
    ).rejects.toThrow('PresentationCredentialHolderBindingMissing')
  })

  test('signs a development-only SD-JWT+KB presentation token with software EdDSA', async () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'
    const proofJwt = await signProof('nonce-123', 'https://issuer.example.com')
    const proofHeader = base64UrlDecode(proofJwt.split('.')[0])
    const sdJwt = `${unsignedJwt({
      iss: 'https://issuer.example.com',
      vct: 'https://issuer.example.com/credentials/TranscriptCredential',
      cnf: { jwk: proofHeader.jwk },
    })}~disclosure~`

    const presentation = await signSoftwareEddsaSdJwtKbPresentationToken({
      audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      sdJwt,
    }, true)

    expect(presentation.startsWith(sdJwt)).toBe(true)
    const kbJwt = presentation.slice(sdJwt.length)
    const [encodedHeader, encodedPayload, encodedSignature] = kbJwt.split('.')
    const header = base64UrlDecode(encodedHeader)
    const payload = base64UrlDecode(encodedPayload)

    expect(header).toMatchObject({
      alg: 'EdDSA',
      typ: 'kb+jwt',
      jwk: { kty: 'OKP', crv: 'Ed25519' },
    })
    expect(header.kid).toBeUndefined()
    expect(payload).toMatchObject({
      aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
    })
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.sd_hash).toBe('string')
    expect(typeof encodedSignature).toBe('string')
    expect(encodedSignature.length).toBeGreaterThan(0)
  })

  test('accepts SD-JWT holder binding by cnf.kid when it matches the software Ed25519 holder DID', async () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'
    const proofJwt = await signProof('nonce-123', 'https://issuer.example.com')
    const proofHeader = base64UrlDecode(proofJwt.split('.')[0])
    const holderDid = String(proofHeader.kid).split('#')[0]
    const sdJwt = `${unsignedJwt({
      iss: 'https://issuer.example.com',
      vct: 'https://issuer.example.com/credentials/TranscriptCredential',
      cnf: { kid: holderDid },
    })}~disclosure~`

    const presentation = await signSoftwareEddsaSdJwtKbPresentationToken({
      audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      sdJwt,
    }, true)
    const kbJwt = presentation.slice(sdJwt.length)
    const [encodedHeader] = kbJwt.split('.')

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'EdDSA',
      typ: 'kb+jwt',
      kid: holderDid,
    })
    expect(base64UrlDecode(encodedHeader).jwk).toBeUndefined()
  })

  test('rejects development-only software EdDSA SD-JWT+KB signing when the credential is not bound to the software Ed25519 key', async () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'

    await expect(
      signSoftwareEddsaSdJwtKbPresentationToken({
        audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
        nonce: 'request-123',
        sdJwt: `${unsignedJwt({
          iss: 'https://issuer.example.com',
          vct: 'https://issuer.example.com/credentials/TranscriptCredential',
        })}~`,
      }, true),
    ).rejects.toThrow('PresentationCredentialHolderBindingMissing')

    await expect(
      signSoftwareEddsaSdJwtKbPresentationToken({
        audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
        nonce: 'request-123',
        sdJwt: `${unsignedJwt({
          iss: 'https://issuer.example.com',
          vct: 'https://issuer.example.com/credentials/TranscriptCredential',
          cnf: { jwk: { kty: 'OKP', crv: 'Ed25519', x: 'different-key' } },
        })}~`,
      }, true),
    ).rejects.toThrow('PresentationCredentialHolderBindingMismatch')
  })

  test('blocks software EdDSA signing outside development', async () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'

    await expect(
      signSoftwareEddsaSdJwtKbPresentationToken({
        audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
        nonce: 'request-123',
        sdJwt: `${unsignedJwt({ iss: 'https://issuer.example.com' })}~`,
      }, false),
    ).rejects.toThrow('SoftwareEddsaTestingOnly')
  })

  test('disables native biometric prompts for tester builds when the dev-only flag is enabled', async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))
    jest.mocked(sign).mockResolvedValue(new Uint8Array(64).fill(7))

    await generateWalletKeyIfNeeded()
    await signProof('nonce-123', 'https://issuer.example.com')

    expect(generateKeypair).toHaveBeenCalledWith('etda_wallet_signing_key', false)
    expect(sign).toHaveBeenCalledWith(
      'etda_wallet_signing_key',
      expect.any(Uint8Array),
      false,
    )
  })
})
