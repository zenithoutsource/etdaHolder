import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { createHash, randomBytes } from 'react-native-quick-crypto'
import * as Keychain from 'react-native-keychain'

import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'
import { base64UrlDecodeToString, isSameJwk, isSameKid, readRecord, toErrorMessage } from '@/src/utils/jwtUtils'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getMetaStorage } from '../storage/storage'
import { readWalletKeyDeviceDiagnostics } from './walletKeyDeviceDiagnostics'
import { notifyWalletKeyRegistrationChanged } from './walletKeyExpiryWatch'

hashes.sha512 = sha512

const KEY_ID = 'etda_wallet_signing_key'
const KEYCHAIN_SERVICE = 'etda.wallet.ed25519_seed'
/** Temporary superseded seed retained for old-VC OID4VP PoP during P3 renewal. */
const PREVIOUS_KEYCHAIN_SERVICE = 'wallet.ed25519_seed.previous'
const KEYCHAIN_USERNAME = 'wallet-ed25519-seed'
const PREVIOUS_KEYCHAIN_USERNAME = 'wallet-ed25519-seed-previous'
const ED25519_PUBLIC_KEY_STORAGE = 'wallet.ed25519_pub_key'
const PREVIOUS_ED25519_PUBLIC_KEY_STORAGE = 'wallet.ed25519_pub_key.previous'
const KEY_REGISTERED_AT_STORAGE = 'wallet.key_registered_at'
const KEY_SOURCE_STORAGE = 'wallet.key_source'
const KEY_SOURCE_KEYCHAIN_ED25519 = 'keychain-ed25519'

const LEGACY_COMPRESSED_KEY_STORAGE = 'wallet.compressed_pub_key'
const LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE = 'wallet.software_ed25519_secret_key'

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const metaStorage = getMetaStorage()

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
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

function ed25519PublicKeyToDidKey(publicKey: Uint8Array): string {
  assertEd25519PublicKeyLength(publicKey)
  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(publicKey, ED25519_MULTICODEC_PREFIX.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

function publicKeyToEd25519Jwk(publicKey: Uint8Array): JsonWebKey {
  assertEd25519PublicKeyLength(publicKey)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncode(publicKey),
  }
}

function assertEd25519PublicKeyLength(publicKey: Uint8Array): void {
  if (publicKey.length !== 32) {
    throw new Error(`InvalidPublicKeyLength: expected 32 Ed25519 bytes, got ${publicKey.length}`)
  }
}

function assertEd25519SeedLength(seed: Uint8Array, errorCode: string): void {
  if (seed.length !== 32) {
    throw new Error(`${errorCode}: expected 32 Ed25519 seed bytes, got ${seed.length}`)
  }
}

function readErrorField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[field] : undefined
}

function isWalletKeySigningCancellation(error: unknown): boolean {
  const code = readErrorField(error, 'code')
  const name = String(readErrorField(error, 'name') ?? '')
  const message = toErrorMessage(error)
  const hasNativeCancelCode = /code:\s*(10|13)\b/i.test(message)
  const hasCancelText = /\bCancel(?:led|ed)?\b/i.test(message) || message.includes('ยกเลิก')

  if (code === 'E_USER_CANCELED' || code === 'USER_CANCELED') return true

  // BiometricPrompt cancel codes: 10 = ERROR_USER_CANCELED, 13 = ERROR_NEGATIVE_BUTTON.
  // Depending on the react-native-keychain code path these surface as a
  // numeric/string `code` field or embedded in the message ("code: 13, msg: Cancel").
  if (code === 10 || code === 13 || code === '10' || code === '13') return true
  if (hasNativeCancelCode && hasCancelText) return true

  return (
    code === 'E_CRYPTO_FAILED' &&
    name.includes('CryptoFailedException') &&
    hasNativeCancelCode
  )
}

async function replaceLegacyWalletKeyIfNeeded(): Promise<void> {
  const hasLegacyKeyMaterial =
    metaStorage.getString(LEGACY_COMPRESSED_KEY_STORAGE) ||
    metaStorage.getString(LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE)

  if (!hasLegacyKeyMaterial) return

  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => undefined)
  metaStorage.remove(LEGACY_COMPRESSED_KEY_STORAGE)
  metaStorage.remove(LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE)
  metaStorage.remove(KEY_SOURCE_STORAGE)
}

function getKeychainSetOptions(service: string): Keychain.SetOptions {
  if (isBiometricDisabledForTesting()) {
    return {
      service,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }
  }

  return {
    service,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  }
}

/** Non-secret keychain policy summary for key-creation failure diagnostics. */
function describeKeychainSetOptions(service: string): Record<string, unknown> {
  const options = getKeychainSetOptions(service)
  return {
    accessControl: options.accessControl,
    accessible: options.accessible,
    securityLevel: options.securityLevel,
    storage: options.storage,
  }
}

function attachWalletKeyStep(error: unknown, step: string): void {
  if (typeof error === 'object' && error !== null) {
    ;(error as { walletKeyStep?: string }).walletKeyStep = step
  }
}

function getKeychainGetOptions(service: string, promptTitle?: string): Keychain.GetOptions {
  if (isBiometricDisabledForTesting()) {
    return { service }
  }

  return {
    service,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    authenticationPrompt: {
      title: promptTitle ?? 'Unlock Wallet Key',
      cancel: 'Cancel',
    },
  }
}

async function readStoredEd25519Seed(
  service: string,
  promptTitle?: string,
): Promise<Uint8Array | undefined> {
  const credentials = await Keychain.getGenericPassword(getKeychainGetOptions(service, promptTitle))
  if (!credentials) return undefined

  const seed = base64ToUint8Array(credentials.password)
  assertEd25519SeedLength(seed, 'InvalidStoredEd25519SeedLength')
  return seed
}

async function writeEd25519Seed(
  seed: Uint8Array,
  service: string,
  username: string,
): Promise<void> {
  assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
  const result = await Keychain.setGenericPassword(
    username,
    uint8ArrayToBase64(seed),
    getKeychainSetOptions(service),
  )
  if (!result) throw new Error('Ed25519SeedKeychainWriteFailed')
}

function cacheWalletPublicKey(publicKey: Uint8Array, registeredAt?: string): void {
  assertEd25519PublicKeyLength(publicKey)
  metaStorage.set(ED25519_PUBLIC_KEY_STORAGE, uint8ArrayToBase64(publicKey))
  metaStorage.set(KEY_SOURCE_STORAGE, KEY_SOURCE_KEYCHAIN_ED25519)
  if (registeredAt) {
    metaStorage.set(KEY_REGISTERED_AT_STORAGE, registeredAt)
    notifyWalletKeyRegistrationChanged()
  }
}

function readPublicKeyFromSeed(seed: Uint8Array): Uint8Array {
  const publicKey = getPublicKey(seed)
  assertEd25519PublicKeyLength(publicKey)
  return publicKey
}

/**
 * Called once at app startup (_layout.tsx). Idempotent: no-ops if the native
 * Ed25519 public key is cached. The private seed is stored in Keychain and
 * retrieved through biometric/device authentication on signing operations.
 */
export async function generateWalletKeyIfNeeded(): Promise<void> {
  if (
    metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE) &&
    metaStorage.getString(KEY_SOURCE_STORAGE) === KEY_SOURCE_KEYCHAIN_ED25519
  ) {
    logWalletStep('crypto', 'wallet-key-cache-hit', { keyId: KEY_ID, alg: 'EdDSA', crv: 'Ed25519' })
    return
  }

  logWalletStep('crypto', 'wallet-key-init-start', { keyId: KEY_ID, alg: 'EdDSA', crv: 'Ed25519' })

  let step = 'legacy-cleanup'
  let existingKeyPresent: boolean | undefined
  try {
    await replaceLegacyWalletKeyIfNeeded()
    step = 'stale-cache-reset'
    if (
      metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE) &&
      metaStorage.getString(KEY_SOURCE_STORAGE) !== KEY_SOURCE_KEYCHAIN_ED25519
    ) {
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => undefined)
      metaStorage.remove(ED25519_PUBLIC_KEY_STORAGE)
      metaStorage.remove(KEY_REGISTERED_AT_STORAGE)
    }

    step = 'keychain-read'
    const existingSeed = await readStoredEd25519Seed(KEYCHAIN_SERVICE)
    existingKeyPresent = Boolean(existingSeed)
    if (existingSeed) {
      step = 'public-key-derive-existing'
      const existingPublicKey = readPublicKeyFromSeed(existingSeed)
      step = 'cache-write'
      cacheWalletPublicKey(existingPublicKey)
      logWalletStep('crypto', 'wallet-key-keychain-existing', { keyId: KEY_ID, publicKeyBytes: existingPublicKey.length })
      return
    }

    step = 'seed-generate'
    const seed = randomBytes(32)
    assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
    step = 'keychain-write'
    await writeEd25519Seed(seed, KEYCHAIN_SERVICE, KEYCHAIN_USERNAME)
    step = 'public-key-derive'
    const publicKey = readPublicKeyFromSeed(seed)
    step = 'cache-write'
    cacheWalletPublicKey(publicKey, new Date().toISOString())
    logWalletStep('crypto', 'wallet-key-generated', { keyId: KEY_ID, publicKeyBytes: publicKey.length })
  } catch (error) {
    attachWalletKeyStep(error, step)
    logWalletError('crypto', 'wallet-key-init-failed', error, {
      keyId: KEY_ID,
      alg: 'EdDSA',
      crv: 'Ed25519',
      step,
      existingKeyPresent,
      biometricDisabledForTesting: isBiometricDisabledForTesting(),
      keychainOptions: describeKeychainSetOptions(KEYCHAIN_SERVICE),
      device: await readWalletKeyDeviceDiagnostics(),
    })
    throw error
  }
}

/**
 * Rotates the active wallet key while retaining the previous seed for old-VC
 * OID4VP PoP during credential renewal. Keychain read of the current seed is
 * the biometric gate for this action.
 */
export async function forceRotateWalletKey(now = new Date()): Promise<void> {
  let step = 'previous-seed-read'
  let previousKeyRetained = false
  try {
    const previousSeed = await readStoredEd25519Seed(KEYCHAIN_SERVICE, 'Rotate Wallet Key')
    if (previousSeed) {
      step = 'previous-seed-retain'
      await writeEd25519Seed(previousSeed, PREVIOUS_KEYCHAIN_SERVICE, PREVIOUS_KEYCHAIN_USERNAME)
      const previousPublicKey = readPublicKeyFromSeed(previousSeed)
      metaStorage.set(PREVIOUS_ED25519_PUBLIC_KEY_STORAGE, uint8ArrayToBase64(previousPublicKey))
      previousKeyRetained = true
      logWalletStep('crypto', 'wallet-key-previous-retained', {
        keyId: KEY_ID,
        publicKeyBytes: previousPublicKey.length,
      })
    }

    step = 'seed-generate'
    const seed = randomBytes(32)
    assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
    step = 'keychain-write'
    await writeEd25519Seed(seed, KEYCHAIN_SERVICE, KEYCHAIN_USERNAME)
    step = 'public-key-derive'
    const publicKey = readPublicKeyFromSeed(seed)
    step = 'cache-write'
    cacheWalletPublicKey(publicKey, now.toISOString())
    logWalletStep('crypto', 'wallet-key-rotated', { keyId: KEY_ID, publicKeyBytes: publicKey.length })
  } catch (error) {
    attachWalletKeyStep(error, step)
    logWalletError('crypto', 'wallet-key-rotate-failed', error, {
      keyId: KEY_ID,
      alg: 'EdDSA',
      crv: 'Ed25519',
      step,
      previousKeyRetained,
      biometricDisabledForTesting: isBiometricDisabledForTesting(),
      keychainOptions: describeKeychainSetOptions(KEYCHAIN_SERVICE),
      device: await readWalletKeyDeviceDiagnostics(),
    })
    throw error
  }
}

export function hasWalletKey(): boolean {
  return !!metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)
}

export function hasPreviousWalletKey(): boolean {
  return !!metaStorage.getString(PREVIOUS_ED25519_PUBLIC_KEY_STORAGE)
}

/** Returns when the Wallet Signing Key was registered (ISO 8601), or undefined if not yet generated. */
export function getWalletKeyRegisteredAt(): string | undefined {
  return metaStorage.getString(KEY_REGISTERED_AT_STORAGE)
}

/** Returns the Holder DID derived from the cached Ed25519 public key. Sync, no biometric. */
export function getHolderDid(): string {
  return ed25519PublicKeyToDidKey(readStoredEd25519PublicKey())
}

/** Previous Holder DID retained after rotation. Sync, no biometric. */
export function getPreviousHolderDid(): string | undefined {
  const stored = metaStorage.getString(PREVIOUS_ED25519_PUBLIC_KEY_STORAGE)
  if (!stored) return undefined
  const publicKey = base64ToUint8Array(stored)
  assertEd25519PublicKeyLength(publicKey)
  return ed25519PublicKeyToDidKey(publicKey)
}

/** Returns the public key JWK. Sync, no biometric. */
export function getPublicKeyJwk(): JsonWebKey {
  return publicKeyToEd25519Jwk(readStoredEd25519PublicKey())
}

export function getPreviousPublicKeyJwk(): JsonWebKey | undefined {
  const stored = metaStorage.getString(PREVIOUS_ED25519_PUBLIC_KEY_STORAGE)
  if (!stored) return undefined
  const publicKey = base64ToUint8Array(stored)
  assertEd25519PublicKeyLength(publicKey)
  return publicKeyToEd25519Jwk(publicKey)
}

function readStoredEd25519PublicKey(): Uint8Array {
  const stored = metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)
  if (!stored) throw new Error('WalletKeyNotInitialized')
  const publicKey = base64ToUint8Array(stored)
  assertEd25519PublicKeyLength(publicKey)
  return publicKey
}

/**
 * Builds and signs an OID4VCI Proof of Possession JWT.
 * Biometric fires here on every call (sign-time gate).
 *
 * Default (`did-kid`): iss/sub = Holder DID, header `kid` = DID key fragment.
 * `jwk`: header carries OKP/Ed25519 public JWK plus `cose_key` (base64url CBOR
 * RFC 8152 key) for issuers that bind mDOC as `cose_key`. Payload omits iss/sub
 * for pre-authorized PoP.
 *
 * @param nonce    c_nonce from the token endpoint response
 * @param audience Issuer URL (aud claim)
 */
export type SignProofOptions = {
  keyBinding?: 'did-kid' | 'jwk'
}

export async function signProof(
  nonce: string,
  audience: string,
  options: SignProofOptions = {},
): Promise<string> {
  const keyBinding = options.keyBinding ?? 'did-kid'
  const header =
    keyBinding === 'jwk'
      ? {
          alg: 'EdDSA' as const,
          typ: 'openid4vci-proof+jwt' as const,
          jwk: getPublicKeyJwk(),
          // Non-IANA JOSE param: Ed25519 COSE_Key CBOR for cose_key-binding issuers.
          cose_key: getHolderCoseKeyBase64Url(),
        }
      : (() => {
          const did = getHolderDid()
          const kid = `${did}#${did.slice('did:key:'.length)}`
          return { alg: 'EdDSA' as const, typ: 'openid4vci-proof+jwt' as const, kid }
        })()

  const payload =
    keyBinding === 'jwk'
      ? {
          aud: audience,
          iat: Math.floor(Date.now() / 1000),
          nonce,
        }
      : (() => {
          const did = getHolderDid()
          return {
            iss: did,
            sub: did,
            aud: audience,
            iat: Math.floor(Date.now() / 1000),
            nonce,
          }
        })()

  logWalletStep('crypto', 'sign-proof-start', {
    alg: header.alg,
    typ: header.typ,
    keyBinding,
    kid: 'kid' in header ? header.kid : undefined,
    jwkCrv: 'jwk' in header ? header.jwk.crv : undefined,
    coseKeyPresent: 'cose_key' in header,
    audience,
    noncePresent: Boolean(nonce),
  })
  return signJwtLikeObject(header, payload, 'proof')
}

/** RFC 8152 COSE_Key for the holder Ed25519 public key, base64url-encoded CBOR. */
export function getHolderCoseKeyBase64Url(): string {
  return base64UrlEncode(encodeEd25519CoseKey(readStoredEd25519PublicKey()))
}

/**
 * COSE_Key map (RFC 8152 / ISO 18013-5 device key shape) for Ed25519:
 * {1:1, 3:-8, -1:6, -2:x}
 */
function encodeEd25519CoseKey(publicKey: Uint8Array): Uint8Array {
  assertEd25519PublicKeyLength(publicKey)
  // A4 = map(4)
  // 01 01 = kty: OKP (1)
  // 03 27 = alg: EdDSA (-8 → CBOR negative 7 → 0x27)
  // 20 06 = crv: Ed25519 (-1 → 0x20, value 6)
  // 21 58 20 <32 bytes> = x (-2 → 0x21, bstr 32)
  const out = new Uint8Array(4 + 2 + 2 + 2 + 2 + publicKey.length)
  let i = 0
  out[i++] = 0xa4
  out[i++] = 0x01
  out[i++] = 0x01
  out[i++] = 0x03
  out[i++] = 0x27
  out[i++] = 0x20
  out[i++] = 0x06
  out[i++] = 0x21
  out[i++] = 0x58
  out[i++] = 0x20
  out.set(publicKey, i)
  return out
}

export type HolderStatusChangePopInput = {
  nonce: string
  audience: string
  credentialId: string
  action?: 'revoke'
}

/**
 * Signs Holder-initiated status-change PoP (P6 holder revoke).
 * Biometric fires here on every call (sign-time gate).
 */
export async function signHolderStatusChangePop(
  input: HolderStatusChangePopInput,
): Promise<string> {
  const did = getHolderDid()
  const kid = `${did}#${did.slice('did:key:'.length)}`
  const header = { alg: 'EdDSA', typ: 'holder-status-change+jwt', kid }
  const payload = {
    iss: did,
    sub: did,
    aud: input.audience,
    iat: Math.floor(Date.now() / 1000),
    nonce: input.nonce,
    credential_id: input.credentialId,
    action: input.action ?? 'revoke',
  }

  logWalletStep('crypto', 'sign-holder-status-change-pop-start', {
    credentialId: input.credentialId,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
  })
  return signJwtLikeObject(header, payload, 'holder-status-change-pop')
}

export type PresentationVpTokenInput = {
  audience: string
  nonce: string
  verifiableCredential: string
}

export type SdJwtKbPresentationTokenInput = {
  audience: string
  nonce: string
  sdJwt: string
}

/**
 * Builds and signs a JWT VP token for OID4VP direct_post.
 * Biometric fires here on every presentation approval.
 */
export async function signPresentationVpToken(input: PresentationVpTokenInput): Promise<string> {
  const did = getHolderDid()
  const kid = `${did}#${did.slice('did:key:'.length)}`
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'EdDSA', typ: 'JWT', kid }
  const payload = {
    iss: did,
    sub: did,
    jti: `urn:uuid:${createUuid()}`,
    aud: input.audience,
    nbf: now,
    iat: now,
    exp: now + 300,
    nonce: input.nonce,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: did,
      verifiableCredential: [input.verifiableCredential],
    },
  }

  logWalletStep('crypto', 'sign-vp-token-start', {
    alg: header.alg,
    typ: header.typ,
    kid,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
    credentialBytes: input.verifiableCredential.length,
  })
  return signJwtLikeObject(header, payload, 'vp')
}

/**
 * Builds an SD-JWT+KB presentation token for OID4VP dc+sd-jwt requests.
 * Biometric fires here on every presentation approval.
 */
export async function signSdJwtKbPresentationToken(input: SdJwtKbPresentationTokenInput): Promise<string> {
  return signSdJwtKbPresentationTokenWithSeed(input, 'active')
}

/**
 * SD-JWT+KB signed with the previous (pre-rotation) Keychain seed for silent
 * renewal OID4VP of an old VC.
 */
export async function signSdJwtKbPresentationTokenWithPreviousKey(
  input: SdJwtKbPresentationTokenInput,
): Promise<string> {
  return signSdJwtKbPresentationTokenWithSeed(input, 'previous')
}

/**
 * JWT VP token signed with the previous Keychain seed for silent renewal OID4VP.
 */
export async function signPresentationVpTokenWithPreviousKey(
  input: PresentationVpTokenInput,
): Promise<string> {
  const previousDid = getPreviousHolderDid()
  if (!previousDid) throw new Error('PreviousWalletKeyNotInitialized')
  const kid = `${previousDid}#${previousDid.slice('did:key:'.length)}`
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'EdDSA', typ: 'JWT', kid }
  const payload = {
    iss: previousDid,
    sub: previousDid,
    jti: `urn:uuid:${createUuid()}`,
    aud: input.audience,
    nbf: now,
    iat: now,
    exp: now + 300,
    nonce: input.nonce,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: previousDid,
      verifiableCredential: [input.verifiableCredential],
    },
  }

  logWalletStep('crypto', 'sign-vp-token-previous-start', {
    alg: header.alg,
    typ: header.typ,
    kid,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
    credentialBytes: input.verifiableCredential.length,
  })
  return signJwtLikeObject(header, payload, 'vp-previous', 'previous')
}

async function signSdJwtKbPresentationTokenWithSeed(
  input: SdJwtKbPresentationTokenInput,
  seedKind: 'active' | 'previous',
): Promise<string> {
  const did = seedKind === 'previous' ? getPreviousHolderDid() : getHolderDid()
  if (!did) throw new Error(seedKind === 'previous' ? 'PreviousWalletKeyNotInitialized' : 'WalletKeyNotInitialized')
  const jwk = seedKind === 'previous' ? getPreviousPublicKeyJwk() : getPublicKeyJwk()
  if (!jwk) throw new Error('PreviousWalletKeyNotInitialized')

  const kid = `${did}#${did.slice('did:key:'.length)}`
  const cnfKid = assertSdJwtHolderBinding(input.sdJwt, { jwk, kid })

  const now = Math.floor(Date.now() / 1000)
  const sdJwtWithoutKb = normalizeSdJwtWithoutKb(input.sdJwt)
  const sdHash = base64UrlEncode(createHash('sha256').update(new TextEncoder().encode(sdJwtWithoutKb)).digest())

  const header = { alg: 'EdDSA', typ: 'kb+jwt', kid: cnfKid ?? kid }
  const payload = {
    nonce: input.nonce,
    aud: input.audience,
    iat: now,
    sd_hash: sdHash,
  }

  logWalletStep('crypto', seedKind === 'previous' ? 'sign-sd-jwt-kb-previous-start' : 'sign-sd-jwt-kb-start', {
    alg: header.alg,
    typ: header.typ,
    kid: header.kid,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
    sdJwtBytes: input.sdJwt.length,
  })
  const kbJwt = await signJwtLikeObject(
    header,
    payload,
    seedKind === 'previous' ? 'kb-previous' : 'kb',
    seedKind,
  )
  logWalletStep('crypto', seedKind === 'previous' ? 'sign-sd-jwt-kb-previous-complete' : 'sign-sd-jwt-kb-complete', {
    kbBytes: kbJwt.length,
    presentationBytes: sdJwtWithoutKb.length + kbJwt.length,
  })
  return `${sdJwtWithoutKb}${kbJwt}`
}

async function signJwtLikeObject(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  tokenKind: string,
  seedKind: 'active' | 'previous' = 'active',
): Promise<string> {
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  let signatureBytes: Uint8Array
  try {
    const service = seedKind === 'previous' ? PREVIOUS_KEYCHAIN_SERVICE : KEYCHAIN_SERVICE
    const promptTitle =
      seedKind === 'previous' ? 'Sign with Previous Wallet Key' : 'Sign with Wallet Key'
    const seed = await readStoredEd25519Seed(service, promptTitle)
    if (!seed) {
      throw new Error(seedKind === 'previous' ? 'PreviousWalletKeyNotInitialized' : 'WalletKeyNotInitialized')
    }
    signatureBytes = sign(new TextEncoder().encode(signingInput), seed)
  } catch (error) {
    if (isWalletKeySigningCancellation(error)) {
      logWalletStep('crypto', 'keychain-ed25519-sign-cancelled', { keyId: KEY_ID, tokenKind, seedKind })
      throw new Error('WalletKeySigningCancelled')
    }
    logWalletError('crypto', 'keychain-ed25519-sign-failed', error, {
      keyId: KEY_ID,
      tokenKind,
      seedKind,
      signingInputBytes: signingInput.length,
    })
    throw error
  }

  if (signatureBytes.length !== 64) {
    throw new Error(`InvalidSignatureLength: expected 64 Ed25519 bytes for ${tokenKind}, got ${signatureBytes.length}`)
  }

  logWalletStep('crypto', 'keychain-ed25519-sign-complete', {
    keyId: KEY_ID,
    tokenKind,
    seedKind,
    signatureBytes: signatureBytes.length,
  })
  return `${signingInput}.${base64UrlEncode(signatureBytes)}`
}

function normalizeSdJwtWithoutKb(sdJwt: string): string {
  return sdJwt.endsWith('~') ? sdJwt : `${sdJwt}~`
}

function assertSdJwtHolderBinding(sdJwt: string, holder: { jwk: JsonWebKey; kid: string }): string | undefined {
  const claims = decodeJwtPayload(sdJwt.split('~')[0] ?? sdJwt)
  const cnf = readRecord(claims.cnf)
  const cnfJwk = readRecord(cnf?.jwk)
  const cnfKid = typeof cnf?.kid === 'string' ? cnf.kid : undefined
  if (!cnfJwk && !cnfKid) {
    throw new Error('PresentationCredentialHolderBindingMissing: SD-JWT credential has no cnf.jwk or cnf.kid holder binding')
  }

  if (cnfKid && isSameKid(cnfKid, holder.kid)) return cnfKid
  if (cnfJwk && isSameJwk(cnfJwk, holder.jwk as Record<string, unknown>)) return undefined

  throw new Error('PresentationCredentialHolderBindingMismatch: SD-JWT credential is not bound to this Wallet Signing Key')
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')
  if (parts.length < 2 || !parts[1]) {
    throw new Error('CredentialJwtInvalid: JWT payload is required')
  }

  try {
    const parsed = JSON.parse(base64UrlDecodeToString(parts[1])) as unknown
    const record = readRecord(parsed)
    if (!record) {
      throw new Error('payload is not an object')
    }
    return record
  } catch (error) {
    throw new Error(`CredentialJwtInvalid: ${toErrorMessage(error)}`)
  }
}

function createUuid(): string {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Deletes the Keychain Ed25519 seed and clears cached public key. Users must re-enrol. */
export async function resetWalletKey(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  await clearPreviousWalletKey()
  metaStorage.remove(ED25519_PUBLIC_KEY_STORAGE)
  metaStorage.remove(KEY_REGISTERED_AT_STORAGE)
  metaStorage.remove(KEY_SOURCE_STORAGE)
  metaStorage.remove(LEGACY_COMPRESSED_KEY_STORAGE)
  metaStorage.remove(LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE)
}

/** Wipes the superseded seed retained for P3 old-VC OID4VP PoP. */
export async function clearPreviousWalletKey(): Promise<void> {
  await Keychain.resetGenericPassword({ service: PREVIOUS_KEYCHAIN_SERVICE }).catch(() => undefined)
  metaStorage.remove(PREVIOUS_ED25519_PUBLIC_KEY_STORAGE)
  logWalletStep('crypto', 'wallet-key-previous-cleared', { keyId: KEY_ID })
}
