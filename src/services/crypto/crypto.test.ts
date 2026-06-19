import * as Keychain from 'react-native-keychain'

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

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const ED25519_SEED_BASE64 = 'nWGxne/9XmC6hEr0kuwsxERJxWl7MmkZcDusAxyn92A='
const ED25519_PUBLIC_KEY = new Uint8Array([
  0x6a, 0x95, 0x33, 0xb7, 0xce, 0xe4, 0x0e, 0xa8,
  0x93, 0xf4, 0x6a, 0x47, 0xb4, 0x55, 0x7c, 0xa0,
  0x24, 0xb3, 0x74, 0x07, 0xb9, 0x08, 0x5a, 0xa7,
  0xbb, 0xe5, 0xc4, 0xf7, 0xf0, 0xc0, 0x5b, 0xf9,
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

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function unsignedJwt(payload: Record<string, unknown>): string {
  return `${base64UrlEncode({ alg: 'none', typ: 'vc+sd-jwt' })}.${base64UrlEncode(payload)}.`
}

describe('Keychain Ed25519 wallet crypto service', () => {
  const originalBiometricFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING

  beforeEach(() => {
    getMetaStorage().clearAll()
    jest.clearAllMocks()
    jest.mocked(Keychain.getGenericPassword).mockResolvedValue({
      username: 'wallet-ed25519-seed',
      password: ED25519_SEED_BASE64,
      service: 'etda.wallet.ed25519_seed',
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    })
    delete process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalBiometricFlag
  })

  test('derives Holder DID and public JWK from Keychain-protected Ed25519 seed', async () => {
    await generateWalletKeyIfNeeded()

    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(expect.objectContaining({
      service: 'etda.wallet.ed25519_seed',
    }))
    expect(getHolderDid()).toBe(ED25519_DID_KEY_VECTOR)
    expect(getPublicKeyJwk()).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
    })
  })

  test('signs OID4VCI PoP JWT with Keychain EdDSA and Ed25519 holder DID', async () => {
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
    expect(base64UrlDecodeBytes(jwt.split('.')[2])).toHaveLength(64)
    expect(Keychain.getGenericPassword).toHaveBeenLastCalledWith(expect.objectContaining({
      service: 'etda.wallet.ed25519_seed',
      authenticationPrompt: {
        title: 'Sign with Wallet Key',
        cancel: 'Cancel',
      },
    }))
  })

  test('signs OID4VP JWT VP token with Keychain EdDSA', async () => {
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

  test('signs SD-JWT+KB presentation token with Keychain EdDSA and Ed25519 holder binding', async () => {
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

  test('rejects Keychain Ed25519 SD-JWT+KB signing when the credential is not holder-bound to the wallet key', async () => {
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

  test('omits Keychain signing prompts for tester builds when the dev-only flag is enabled', async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'

    await generateWalletKeyIfNeeded()
    await signProof('nonce-123', 'https://issuer.example.com')

    expect(Keychain.getGenericPassword).toHaveBeenLastCalledWith(expect.not.objectContaining({
      authenticationPrompt: expect.anything(),
    }))
  })

  test('resetWalletKey deletes the Keychain Ed25519 seed and cached public key', async () => {
    await generateWalletKeyIfNeeded()
    await resetWalletKey()

    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'etda.wallet.ed25519_seed' })
    expect(() => getHolderDid()).toThrow('WalletKeyNotInitialized')
  })

  test('generateWalletKeyIfNeeded is idempotent when the cached public key already exists', async () => {
    await generateWalletKeyIfNeeded()
    jest.clearAllMocks()

    await generateWalletKeyIfNeeded()

    expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
    expect(getHolderDid()).toBe(ED25519_DID_KEY_VECTOR)
  })

  test('replaces stale cached Ed25519 public key when no Keychain source marker exists', async () => {
    const storage = getMetaStorage()
    storage.set('wallet.ed25519_pub_key', base64EncodeBytes(new Uint8Array(32).fill(1)))
    jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce(false)
    jest.mocked(Keychain.setGenericPassword).mockResolvedValueOnce({
      service: 'etda.wallet.ed25519_seed',
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    })

    await generateWalletKeyIfNeeded()

    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'etda.wallet.ed25519_seed' })
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-seed',
      expect.any(String),
      expect.objectContaining({ service: 'etda.wallet.ed25519_seed' }),
    )
    expect(getHolderDid()).not.toBe(ed25519DidKeyFromPublicKey(new Uint8Array(32).fill(1)))
  })

  test('generateWalletKeyIfNeeded clears legacy P-256 and software EdDSA key material before generating', async () => {
    const storage = getMetaStorage()
    storage.set('wallet.compressed_pub_key', 'legacy-p256-key')
    storage.set('wallet.software_ed25519_secret_key', 'legacy-secret-key')

    await generateWalletKeyIfNeeded()

    expect(storage.getString('wallet.compressed_pub_key')).toBeUndefined()
    expect(storage.getString('wallet.software_ed25519_secret_key')).toBeUndefined()
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'etda.wallet.ed25519_seed' })
  })

  test('hasWalletKey returns false before key generation and true after', async () => {
    expect(hasWalletKey()).toBe(false)
    await generateWalletKeyIfNeeded()
    expect(hasWalletKey()).toBe(true)
  })

  test('getWalletKeyRegisteredAt is undefined when key is synced from existing Keychain entry', async () => {
    await generateWalletKeyIfNeeded()
    expect(getWalletKeyRegisteredAt()).toBeUndefined()
  })

  test('getWalletKeyRegisteredAt returns an ISO 8601 timestamp when a fresh key is generated', async () => {
    jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce(false)

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

  test('throws when the stored Keychain seed is not 32 bytes', async () => {
    jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({
      username: 'wallet-ed25519-seed',
      password: 'AAAA',
      service: 'etda.wallet.ed25519_seed',
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    })

    await expect(
      generateWalletKeyIfNeeded(),
    ).rejects.toThrow('InvalidStoredEd25519SeedLength')
  })
})
