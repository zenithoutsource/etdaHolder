import {
  generateKeypair,
  getPublicBytesForKeyId,
  sign,
  deleteKey,
} from './nativeEddsaSigner'

import {
  generateWalletKeyIfNeeded,
  getPublicKeyJwk,
  signSdJwtKbPresentationToken,
  getHolderDid,
  signPresentationVpToken,
  signProof,
  resetWalletKey,
  hasWalletKey,
  getWalletKeyRegisteredAt,
} from './crypto'
import { getMetaStorage } from '../storage/storage'

jest.mock('./nativeEddsaSigner', () => ({
  generateKeypair: jest.fn().mockResolvedValue(undefined),
  getPublicBytesForKeyId: jest.fn().mockResolvedValue(new Uint8Array(32)),
  sign: jest.fn().mockResolvedValue(new Uint8Array(64)),
  deleteKey: jest.fn().mockResolvedValue(undefined),
  isNativeEd25519SignerAvailable: jest.fn().mockReturnValue(true),
}))

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const ED25519_PUBLIC_KEY = new Uint8Array([
  0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7,
  0xd5, 0x4b, 0xfe, 0xd3, 0xc9, 0x64, 0x07, 0x3a,
  0x0e, 0xe1, 0x72, 0xf3, 0xda, 0xa6, 0x23, 0x25,
  0xaf, 0x02, 0x1a, 0x68, 0xf7, 0x07, 0x51, 0x1a,
])
const ED25519_DID_KEY_VECTOR = ed25519DidKeyFromPublicKey(ED25519_PUBLIC_KEY)

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

function base58btcEncode(bytes: Uint8Array): string {
  let leadingOnes = 0
  for (const b of bytes) {
    if (b !== 0) break
    leadingOnes++
  }
  let n = bytesToBigInt(bytes)
  let result = ''
  while (n > 0n) {
    const rem = Number(n % 58n)
    result = BASE58_ALPHABET[rem] + result
    n = n / 58n
  }
  return '1'.repeat(leadingOnes) + result
}

function ed25519DidKeyFromPublicKey(publicKey: Uint8Array): string {
  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(publicKey, ED25519_MULTICODEC_PREFIX.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
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

describe('native Ed25519 wallet crypto service', () => {
  const originalBiometricFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING

  beforeEach(() => {
    getMetaStorage().clearAll()
    jest.clearAllMocks()
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(ED25519_PUBLIC_KEY)
    jest.mocked(sign).mockResolvedValue(new Uint8Array(64).fill(7))
    delete process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalBiometricFlag
  })

  test('derives Holder DID and public JWK from native Ed25519 public key bytes', async () => {
    await generateWalletKeyIfNeeded()

    expect(generateKeypair).not.toHaveBeenCalled()
    expect(getHolderDid()).toBe(ED25519_DID_KEY_VECTOR)
    expect(getPublicKeyJwk()).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
    })
  })

  test('signs OID4VCI PoP JWT with native EdDSA and Ed25519 holder DID', async () => {
    await generateWalletKeyIfNeeded()
    const jwt = await signProof('nonce-123', 'https://issuer.example.com')
    const [encodedHeader, encodedPayload] = jwt.split('.')

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'EdDSA',
      typ: 'openid4vci-proof+jwt',
      kid: `${ED25519_DID_KEY_VECTOR}#${ED25519_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(base64UrlDecode(encodedPayload)).toMatchObject({
      iss: ED25519_DID_KEY_VECTOR,
      sub: ED25519_DID_KEY_VECTOR,
      aud: 'https://issuer.example.com',
      nonce: 'nonce-123',
    })
    expect(sign).toHaveBeenCalledWith(
      'etda_wallet_signing_key',
      expect.any(Uint8Array),
      true,
    )
  })

  test('signs OID4VP JWT VP token with native EdDSA', async () => {
    await generateWalletKeyIfNeeded()
    const jwt = await signPresentationVpToken({
      audience: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      verifiableCredential: 'issuer.vc.jwt',
    })
    const [encodedHeader, encodedPayload] = jwt.split('.')
    const payload = base64UrlDecode(encodedPayload)

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'EdDSA',
      typ: 'JWT',
      kid: `${ED25519_DID_KEY_VECTOR}#${ED25519_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(payload).toMatchObject({
      iss: ED25519_DID_KEY_VECTOR,
      sub: ED25519_DID_KEY_VECTOR,
      aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      vp: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: ['issuer.vc.jwt'],
      },
    })
  })

  test('signs SD-JWT+KB presentation token with native EdDSA and Ed25519 holder binding', async () => {
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
      alg: 'EdDSA',
      typ: 'kb+jwt',
      kid: `${ED25519_DID_KEY_VECTOR}#${ED25519_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(payload).toMatchObject({
      aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
    })
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.sd_hash).toBe('string')
  })

  test('rejects native Ed25519 SD-JWT+KB signing when the credential is not holder-bound to the wallet key', async () => {
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

  test('disables native biometric prompts for tester builds when the dev-only flag is enabled', async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'
    jest.mocked(getPublicBytesForKeyId)
      .mockRejectedValueOnce(new Error('missing native key'))
      .mockResolvedValue(ED25519_PUBLIC_KEY)

    await generateWalletKeyIfNeeded()
    await signProof('nonce-123', 'https://issuer.example.com')

    expect(generateKeypair).toHaveBeenCalledWith('etda_wallet_signing_key', false)
    expect(sign).toHaveBeenCalledWith(
      'etda_wallet_signing_key',
      expect.any(Uint8Array),
      false,
    )
  })

  test('resetWalletKey deletes the native Ed25519 key and cached public key', async () => {
    await generateWalletKeyIfNeeded()
    await resetWalletKey()

    expect(deleteKey).toHaveBeenCalledWith('etda_wallet_signing_key')
    expect(() => getHolderDid()).toThrow('WalletKeyNotInitialized')
  })

  test('generateWalletKeyIfNeeded is idempotent when the cached public key already exists', async () => {
    await generateWalletKeyIfNeeded()
    jest.clearAllMocks()

    await generateWalletKeyIfNeeded()

    expect(getPublicBytesForKeyId).not.toHaveBeenCalled()
    expect(generateKeypair).not.toHaveBeenCalled()
    expect(getHolderDid()).toBe(ED25519_DID_KEY_VECTOR)
  })

  test('generateWalletKeyIfNeeded clears legacy P-256 and software EdDSA key material before generating', async () => {
    const storage = getMetaStorage()
    storage.set('wallet.compressed_pub_key', 'legacy-p256-key')
    storage.set('wallet.software_ed25519_secret_key', 'legacy-secret-key')
    jest.mocked(getPublicBytesForKeyId)
      .mockRejectedValueOnce(new Error('no key in keystore'))
      .mockResolvedValue(ED25519_PUBLIC_KEY)

    await generateWalletKeyIfNeeded()

    expect(storage.getString('wallet.compressed_pub_key')).toBeUndefined()
    expect(storage.getString('wallet.software_ed25519_secret_key')).toBeUndefined()
    expect(generateKeypair).toHaveBeenCalledWith('etda_wallet_signing_key', true)
  })

  test('hasWalletKey returns false before key generation and true after', async () => {
    expect(hasWalletKey()).toBe(false)
    await generateWalletKeyIfNeeded()
    expect(hasWalletKey()).toBe(true)
  })

  test('getWalletKeyRegisteredAt is undefined when key is synced from existing native entry', async () => {
    await generateWalletKeyIfNeeded()
    expect(getWalletKeyRegisteredAt()).toBeUndefined()
  })

  test('getWalletKeyRegisteredAt returns an ISO 8601 timestamp when a fresh key is generated', async () => {
    jest.mocked(getPublicBytesForKeyId)
      .mockRejectedValueOnce(new Error('no key'))
      .mockResolvedValue(ED25519_PUBLIC_KEY)

    await generateWalletKeyIfNeeded()

    const registeredAt = getWalletKeyRegisteredAt()
    expect(registeredAt).toBeDefined()
    expect(new Date(registeredAt!).toISOString()).toBe(registeredAt)
  })

  test('rejects SD-JWT+KB signing when the credential cnf.jwk is bound to a different key', async () => {
    await generateWalletKeyIfNeeded()
    const otherJwk = { kty: 'OKP', crv: 'Ed25519', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }
    const sdJwt = `${unsignedJwt({
      iss: 'https://issuer.example.com',
      cnf: { jwk: otherJwk },
    })}~disclosure~`

    await expect(
      signSdJwtKbPresentationToken({ audience: 'https://verifier.example.com', nonce: 'nonce-456', sdJwt }),
    ).rejects.toThrow('PresentationCredentialHolderBindingMismatch')
  })

  test('accepts SD-JWT+KB signing when the credential cnf.kid matches the wallet holder DID', async () => {
    await generateWalletKeyIfNeeded()
    const did = getHolderDid()
    const sdJwt = `${unsignedJwt({
      iss: 'https://issuer.example.com',
      cnf: { kid: `${did}#${did.slice('did:key:'.length)}` },
    })}~disclosure~`

    const presentation = await signSdJwtKbPresentationToken({
      audience: 'https://verifier.example.com',
      nonce: 'nonce-456',
      sdJwt,
    })

    expect(presentation.startsWith(sdJwt)).toBe(true)
    const kbJwt = presentation.slice(sdJwt.length)
    expect(kbJwt.split('.').length).toBe(3)
  })

  test('throws when the native signer returns a signature that is not 64 bytes', async () => {
    await generateWalletKeyIfNeeded()
    jest.mocked(sign).mockResolvedValueOnce(new Uint8Array(32))

    await expect(
      signProof('nonce', 'https://issuer.example.com'),
    ).rejects.toThrow('InvalidSignatureLength')
  })
})
