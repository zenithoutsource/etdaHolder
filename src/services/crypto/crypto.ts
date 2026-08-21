import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { createHash, randomBytes } from 'react-native-quick-crypto'
import * as Keychain from 'react-native-keychain'

import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { base64UrlDecodeToString, formatCredentialCnfHint, formatWalletHolderBindingHint, isSameJwk, isSameKid, readRecord, toErrorMessage } from '@/src/utils/jwtUtils'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getMetaStorage } from '../storage/storage'
import { notifyWalletKeyRegistrationChanged } from './walletKeyExpiryWatch'
import {
  KEY_REGISTERED_AT_STORAGE,
  seedInitialWalletKeyRegisteredAt,
} from './walletKeyRegistration'
import {
  createCredentialKeySigningSession,
  createMemoryPendingCredentialKeySession,
  getCredentialSigningHolderDid,
  readCredentialSigningPublicJwk,
  signWithCredentialKey,
  type CredentialKeySigningSession,
} from './credentialSigningKey'
import { getCredentialKeyRecord, readEarliestCredentialKeyCreatedAt } from './credentialKeyRegistry'
import { usesPerCredentialSigning } from './perCredentialSigning'
import {
  readEarliestEncryptedCredentialKeyCreatedAt,
  readFirstEncryptedCredentialHolderDid,
} from './encryptedCredentialKeyRegistry'
import {
  createHardwarePendingCredentialKeySession,
  hasHardwareCredentialKey,
  openHardwareCredentialSigningSession,
  readHardwareCredentialSigningPublicJwk,
  resolveHardwareCredentialHolderDid,
} from './hardwareCredentialSigningKey'
import {
  signHardwareHolderStatusChangePop,
  signHardwarePresentationVpToken,
  signHardwareProofJwt,
  signHardwareSdJwtKbPresentationToken,
} from './hardwareJwtSigner'
import type { EcP256Jwk } from './hardwareEcdsaTypes'
import { didKeyToP256PublicJwk } from './p256Identity'
import { normalizeSdJwtWithoutKb } from './sdJwtNormalize'

hashes.sha512 = sha512

const KEY_ID = 'etda_wallet_signing_key'
const KEYCHAIN_SERVICE = 'etda.wallet.ed25519_seed'
/** Temporary superseded seed retained for old-VC OID4VP PoP during P3 renewal. */
const PREVIOUS_KEYCHAIN_SERVICE = 'wallet.ed25519_seed.previous'
const KEYCHAIN_USERNAME = 'wallet-ed25519-seed'
const PREVIOUS_KEYCHAIN_USERNAME = 'wallet-ed25519-seed-previous'
const ED25519_PUBLIC_KEY_STORAGE = 'wallet.ed25519_pub_key'
const PREVIOUS_ED25519_PUBLIC_KEY_STORAGE = 'wallet.ed25519_pub_key.previous'
const KEY_SOURCE_STORAGE = 'wallet.key_source'
const KEY_SOURCE_KEYCHAIN_ED25519 = 'keychain-ed25519'

const LEGACY_COMPRESSED_KEY_STORAGE = 'wallet.compressed_pub_key'
const LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE = 'wallet.software_ed25519_secret_key'

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const metaStorage = getMetaStorage()

function shouldUseHardwareCredentialKey(credentialId?: string): credentialId is string {
  return Boolean(
    isHardwareP256SigningEnabled() &&
      credentialId &&
      hasHardwareCredentialKey(credentialId),
  )
}

function assertHardwareHolderSigningAllowed(credentialId?: string): void {
  if (!isHardwareP256SigningEnabled()) return
  requireHardwareCredentialKeyId(credentialId)
}

function requireHardwareCredentialKeyId(credentialId?: string): string {
  if (!credentialId) {
    throw new Error('HardwareCredentialKeyRequired')
  }
  if (!hasHardwareCredentialKey(credentialId)) {
    throw new Error('LegacyHolderSigningUnsupported')
  }
  return credentialId
}

if (__DEV__) {
  logWalletStep('hardware-ecdsa', 'holder-signing-mode', {
    mode: isHardwareP256SigningEnabled() ? 'p256' : 'ed25519',
  })
}

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
      try {
        step = 'public-key-derive-existing'
        const existingPublicKey = readPublicKeyFromSeed(existingSeed)
        step = 'cache-write'
        const existingRegisteredAt = metaStorage.getString(KEY_REGISTERED_AT_STORAGE)
        cacheWalletPublicKey(existingPublicKey, existingRegisteredAt)
        logWalletStep('crypto', 'wallet-key-keychain-existing', { keyId: KEY_ID, publicKeyBytes: existingPublicKey.length })
        return
      } finally {
        existingSeed.fill(0)
      }
    }

    step = 'seed-generate'
    const seed = randomBytes(32)
    try {
      assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
      step = 'keychain-write'
      await writeEd25519Seed(seed, KEYCHAIN_SERVICE, KEYCHAIN_USERNAME)
      step = 'public-key-derive'
      const publicKey = readPublicKeyFromSeed(seed)
      step = 'cache-write'
      cacheWalletPublicKey(publicKey, new Date().toISOString())
      logWalletStep('crypto', 'wallet-key-generated', { keyId: KEY_ID, publicKeyBytes: publicKey.length })
    } finally {
      seed.fill(0)
    }
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
      try {
        step = 'previous-seed-retain'
        await writeEd25519Seed(previousSeed, PREVIOUS_KEYCHAIN_SERVICE, PREVIOUS_KEYCHAIN_USERNAME)
        const previousPublicKey = readPublicKeyFromSeed(previousSeed)
        metaStorage.set(PREVIOUS_ED25519_PUBLIC_KEY_STORAGE, uint8ArrayToBase64(previousPublicKey))
        previousKeyRetained = true
        logWalletStep('crypto', 'wallet-key-previous-retained', {
          keyId: KEY_ID,
          publicKeyBytes: previousPublicKey.length,
        })
      } finally {
        previousSeed.fill(0)
      }
    }

    step = 'seed-generate'
    const seed = randomBytes(32)
    try {
      assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
      step = 'keychain-write'
      await writeEd25519Seed(seed, KEYCHAIN_SERVICE, KEYCHAIN_USERNAME)
      step = 'public-key-derive'
      const publicKey = readPublicKeyFromSeed(seed)
      step = 'cache-write'
      cacheWalletPublicKey(publicKey, now.toISOString())
      logWalletStep('crypto', 'wallet-key-rotated', { keyId: KEY_ID, publicKeyBytes: publicKey.length })
    } finally {
      seed.fill(0)
    }
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

export { seedInitialWalletKeyRegisteredAt } from './walletKeyRegistration'

/** Backfills registration time for wallets that already had a Keychain seed before TTL tracking. */
export function ensureWalletKeyRegisteredAtBackfill(now = new Date()): boolean {
  if (metaStorage.getString(KEY_REGISTERED_AT_STORAGE)) return false

  if (metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)) {
    return seedInitialWalletKeyRegisteredAt(now.toISOString())
  }

  const earliestCredentialBind =
    readEarliestCredentialKeyCreatedAt() ?? readEarliestEncryptedCredentialKeyCreatedAt()
  if (earliestCredentialBind) {
    return seedInitialWalletKeyRegisteredAt(earliestCredentialBind)
  }

  return false
}

/** Refreshes registration time after a v2 no-op rotate so the expiry modal can dismiss. */
export function refreshWalletKeyRegisteredAt(now = new Date()): void {
  if (
    !metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE) &&
    !readEarliestCredentialKeyCreatedAt() &&
    !readEarliestEncryptedCredentialKeyCreatedAt()
  ) {
    return
  }

  metaStorage.set(KEY_REGISTERED_AT_STORAGE, now.toISOString())
  notifyWalletKeyRegistrationChanged()
  logWalletStep('crypto', 'wallet-key-registered-at-refreshed', {
    registeredAt: metaStorage.getString(KEY_REGISTERED_AT_STORAGE),
  })
}

/** Returns the Holder DID derived from the cached Ed25519 public key. Sync, no biometric. */
/** @deprecated Use getCredentialHolderDid(credentialId) for protocol signing in v2 crypto. */
export function getHolderDid(): string {
  if (metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)) {
    return ed25519PublicKeyToDidKey(readStoredEd25519PublicKey())
  }
  if (isHardwareP256SigningEnabled()) {
    const did = readFirstEncryptedCredentialHolderDid()
    if (did) return did
  }
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
  if (metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)) {
    return publicKeyToEd25519Jwk(readStoredEd25519PublicKey())
  }
  if (isHardwareP256SigningEnabled()) {
    const did = readFirstEncryptedCredentialHolderDid()
    if (did) return didKeyToP256PublicJwk(did)
  }
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

/** Unlocks holder Ed25519 seed once for NFC mDOC device-auth during proximity arm. */
export async function withUnlockedHolderSeedForProximity(
  operation: (seed: Uint8Array, publicKey: Uint8Array) => Promise<void>,
): Promise<void> {
  if (isHardwareP256SigningEnabled()) {
    throw new Error('LegacyHolderSigningUnsupported')
  }
  const publicKey = readStoredEd25519PublicKey()
  const seed = await readStoredEd25519Seed(KEYCHAIN_SERVICE, 'Present document via NFC')
  if (!seed) {
    throw new Error('WalletKeyNotInitialized')
  }
  try {
    await operation(seed, publicKey)
  } finally {
    seed.fill(0)
  }
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
export type ProofKeyBinding = 'did-kid' | 'jwk' | 'jwk-kid'

export type SignProofOptions = {
  keyBinding?: ProofKeyBinding
  /** Pending or bound credential key id for v2 per-credential PoP signing. */
  credentialKeyId?: string
}

export type ProofSigningSession = {
  /** Pending or bound per-credential key used by this session in crypto v2. */
  credentialKeyId?: string
  signProof: (
    nonce: string,
    audience: string,
    options?: SignProofOptions,
  ) => Promise<string>
  bindCredentialKey?: (credentialId: string, credentialType: string) => Promise<void>
  close: () => void
}

type HardwareProofSigningContext = {
  publicJwk: EcP256Jwk
  holderDid: string
  sign: (message: Uint8Array) => Promise<Uint8Array>
  bindCredentialKey?: (credentialId: string, credentialType: string) => Promise<void>
  close: () => Promise<void>
}

async function signHardwareProofWithContext(
  nonce: string,
  audience: string,
  options: SignProofOptions,
  credentialKeyId: string,
  ctx: HardwareProofSigningContext,
): Promise<string> {
  if (options.credentialKeyId && options.credentialKeyId !== credentialKeyId) {
    throw new Error('CredentialKeySigningSessionMismatch')
  }

  return signHardwareProofJwt({
    nonce,
    audience,
    keyBinding: options.keyBinding,
    publicJwk: ctx.publicJwk,
    holderDid: ctx.holderDid,
    sign: ctx.sign,
  })
}

function createHardwareProofSigningSession(
  credentialKeyId: string,
  ctx: HardwareProofSigningContext,
): ProofSigningSession {
  return {
    credentialKeyId,
    signProof: (nonce, audience, options = {}) =>
      signHardwareProofWithContext(nonce, audience, options, credentialKeyId, ctx),
    bindCredentialKey: ctx.bindCredentialKey
      ? async (credentialId, credentialType) => ctx.bindCredentialKey!(credentialId, credentialType)
      : undefined,
    close: () => {
      void ctx.close()
    },
  }
}

async function createHardwareBoundProofSigningSession(credentialKeyId: string): Promise<ProofSigningSession> {
  const publicJwk = await readHardwareCredentialSigningPublicJwk(credentialKeyId)
  const holderDid = resolveHardwareCredentialHolderDid(credentialKeyId)
  const hardwareSession = await openHardwareCredentialSigningSession(credentialKeyId, 'oid4vci')

  return createHardwareProofSigningSession(credentialKeyId, {
    publicJwk,
    holderDid,
    sign: (message) => hardwareSession.sign(message),
    close: async () => hardwareSession.close(),
  })
}

export async function createHardwareMemoryIssuanceProofSession(): Promise<ProofSigningSession> {
  const hardwareSession = await createHardwarePendingCredentialKeySession('oid4vci')
  return createHardwareProofSigningSession(hardwareSession.credentialKeyId, {
    publicJwk: hardwareSession.publicJwk,
    holderDid: hardwareSession.holderDid,
    sign: (message) => hardwareSession.sign(message),
    bindCredentialKey: async (credentialId, credentialType) => {
      await hardwareSession.bindCredentialKey(credentialId, credentialType)
    },
    close: async () => hardwareSession.close(),
  })
}

/**
 * Opens one authenticated signing session for a user action.
 *
 * The seed remains private to this module and is cleared when the caller
 * closes the session. This lets a dual-format issuance sign the two
 * protocol-required proofs, including a fresh-nonce retry, after one
 * sign-time Keychain authentication.
 */
export async function createProofSigningSession(
  credentialKeyId?: string,
): Promise<ProofSigningSession> {
  if (isHardwareP256SigningEnabled()) {
    return createHardwareBoundProofSigningSession(requireHardwareCredentialKeyId(credentialKeyId))
  }

  if (credentialKeyId && usesPerCredentialSigning()) {
    const credentialSession = await createCredentialKeySigningSession(credentialKeyId)
    return createCredentialProofSigningSession(credentialKeyId, credentialSession)
  }

  const seed = await readStoredEd25519Seed(KEYCHAIN_SERVICE, 'Sign with Wallet Key')
  if (!seed) {
    throw new Error('WalletKeyNotInitialized')
  }

  let closed = false
  return {
    signProof: async (nonce, audience, options = {}) => {
      if (closed) {
        throw new Error('WalletKeySigningSessionClosed')
      }
      if (options.credentialKeyId) {
        throw new Error('CredentialKeySigningSessionRequired')
      }
      return signProofWithSeed(nonce, audience, options, seed)
    },
    close: () => {
      if (closed) return
      seed.fill(0)
      closed = true
    },
  }
}

function createCredentialProofSigningSession(
  credentialKeyId: string,
  credentialSession: CredentialKeySigningSession,
): ProofSigningSession {
  return {
    credentialKeyId,
    signProof: (nonce, audience, options = {}) =>
      signProofWithCredentialSession(nonce, audience, options, credentialKeyId, credentialSession),
    bindCredentialKey: async (credentialId, credentialType) => {
      await credentialSession.bindCredentialKey(credentialId, credentialType)
    },
    close: credentialSession.close,
  }
}

/** In-memory pending credential key + proof session (no Keychain get until bind). */
export function createMemoryIssuanceProofSession(): ProofSigningSession {
  const credentialSession = createMemoryPendingCredentialKeySession()
  return createCredentialProofSigningSession(credentialSession.credentialKeyId, credentialSession)
}

async function signProofWithCredentialSession(
  nonce: string,
  audience: string,
  options: SignProofOptions,
  credentialKeyId: string,
  credentialSession: CredentialKeySigningSession,
): Promise<string> {
  if (options.credentialKeyId && options.credentialKeyId !== credentialKeyId) {
    throw new Error('CredentialKeySigningSessionMismatch')
  }

  const keyBinding = options.keyBinding ?? 'did-kid'
  const kid = `${credentialSession.holderDid}#${credentialSession.holderDid.slice('did:key:'.length)}`
  const header =
    keyBinding === 'did-kid'
      ? {
          alg: 'EdDSA' as const,
          typ: 'openid4vci-proof+jwt' as const,
          kid,
        }
      : {
          alg: 'EdDSA' as const,
          typ: 'openid4vci-proof+jwt' as const,
          jwk: credentialSession.publicJwk,
          cose_key: base64UrlEncode(
            encodeEd25519CoseKey(
              getPublicKeyFromCredentialSigningJwk(credentialSession.publicJwk),
            ),
          ),
          ...(keyBinding === 'jwk-kid' ? { kid } : {}),
        }
  const payload = {
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    nonce,
  }

  logWalletStep('crypto', 'sign-proof-start', {
    alg: header.alg,
    typ: header.typ,
    keyBinding,
    credentialKeyId,
    kid: 'kid' in header ? header.kid : undefined,
    jwkCrv: 'jwk' in header && header.jwk ? header.jwk.crv : undefined,
    coseKeyPresent: 'cose_key' in header,
    audience,
    noncePresent: Boolean(nonce),
  })
  return signJwtLikeObject(
    header,
    payload,
    'proof',
    'active',
    undefined,
    undefined,
    (message) => credentialSession.sign(message),
  )
}

export async function signProof(
  nonce: string,
  audience: string,
  options: SignProofOptions = {},
): Promise<string> {
  if (isHardwareP256SigningEnabled()) {
    const credentialKeyId = requireHardwareCredentialKeyId(options.credentialKeyId)
    const publicJwk = await readHardwareCredentialSigningPublicJwk(credentialKeyId)
    const holderDid = resolveHardwareCredentialHolderDid(credentialKeyId)
    const hardwareSession = await openHardwareCredentialSigningSession(credentialKeyId, 'oid4vci')
    try {
      return await signHardwareProofJwt({
        nonce,
        audience,
        keyBinding: options.keyBinding,
        publicJwk,
        holderDid,
        sign: (message) => hardwareSession.sign(message),
      })
    } finally {
      await hardwareSession.close()
    }
  }

  return signProofWithSeed(nonce, audience, options)
}

async function signProofWithSeed(
  nonce: string,
  audience: string,
  options: SignProofOptions = {},
  seed?: Uint8Array,
): Promise<string> {
  const keyBinding = options.keyBinding ?? 'did-kid'
  const credentialKeyId = options.credentialKeyId
  const useCredentialKey = Boolean(credentialKeyId && usesPerCredentialSigning())
  const did = useCredentialKey
    ? await getCredentialSigningHolderDid(credentialKeyId!)
    : getHolderDid()
  const kid = `${did}#${did.slice('did:key:'.length)}`

  const header =
    keyBinding === 'did-kid'
      ? {
          alg: 'EdDSA' as const,
          typ: 'openid4vci-proof+jwt' as const,
          kid,
        }
      : {
          alg: 'EdDSA' as const,
          typ: 'openid4vci-proof+jwt' as const,
          jwk: useCredentialKey
            ? await readCredentialSigningPublicJwk(credentialKeyId!)
            : getPublicKeyJwk(),
          cose_key: useCredentialKey
            ? base64UrlEncode(
                encodeEd25519CoseKey(
                  getPublicKeyFromCredentialSigningJwk(
                    await readCredentialSigningPublicJwk(credentialKeyId!),
                  ),
                ),
              )
            : getHolderCoseKeyBase64Url(),
          ...(keyBinding === 'jwk-kid' ? { kid } : {}),
        }

  const payload = {
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    nonce,
  }

  logWalletStep('crypto', 'sign-proof-start', {
    alg: header.alg,
    typ: header.typ,
    keyBinding,
    credentialKeyId: useCredentialKey ? credentialKeyId : undefined,
    kid: 'kid' in header ? header.kid : undefined,
    jwkCrv: 'jwk' in header ? header.jwk.crv : undefined,
    coseKeyPresent: 'cose_key' in header,
    audience,
    noncePresent: Boolean(nonce),
  })
  return signJwtLikeObject(header, payload, 'proof', 'active', credentialKeyId, seed)
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

function base64UrlToUint8Array(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return base64ToUint8Array(padded)
}

function getPublicKeyFromCredentialSigningJwk(jwk: JsonWebKey): Uint8Array {
  if (typeof jwk.x !== 'string') throw new Error('InvalidCredentialSigningJwk')
  const publicKey = base64UrlToUint8Array(jwk.x)
  assertEd25519PublicKeyLength(publicKey)
  return publicKey
}

async function signPresentationVpTokenWithCredentialKey(
  input: PresentationVpTokenInput,
): Promise<string> {
  const credentialId = input.credentialId
  if (!credentialId) throw new Error('CredentialKeyNotFound')

  const did = await getCredentialSigningHolderDid(credentialId)
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

  logWalletStep('crypto', 'sign-vp-token-credential-start', {
    credentialId,
    kid,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
    credentialBytes: input.verifiableCredential.length,
  })
  return signJwtLikeObject(header, payload, 'vp', 'active', credentialId)
}

async function signSdJwtKbPresentationTokenWithCredentialKey(
  input: SdJwtKbPresentationTokenInput,
): Promise<string> {
  const credentialId = input.credentialId
  if (!credentialId) throw new Error('CredentialKeyNotFound')

  const did = await getCredentialSigningHolderDid(credentialId)
  const jwk = await readCredentialSigningPublicJwk(credentialId)
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

  logWalletStep('crypto', 'sign-sd-jwt-kb-credential-start', {
    credentialId,
    kid: header.kid,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
    sdJwtBytes: input.sdJwt.length,
  })
  const kbJwt = await signJwtLikeObject(header, payload, 'kb', 'active', credentialId)
  return `${sdJwtWithoutKb}${kbJwt}`
}

export type HolderStatusChangePopInput = {
  nonce: string
  audience: string
  credentialId: string
  action?: 'revoke'
}

/**
 * Signs Holder-initiated status-change PoP (P6 holder revoke).
 * ES256 hardware k_cred only — no Ed25519 fallback.
 * Biometric fires here on every call (sign-time gate).
 */
export async function signHolderStatusChangePop(
  input: HolderStatusChangePopInput,
): Promise<string> {
  if (!shouldUseHardwareCredentialKey(input.credentialId)) {
    throw new Error(input.credentialId ? 'LegacyHolderSigningUnsupported' : 'HardwareCredentialKeyRequired')
  }

  const did = resolveHardwareCredentialHolderDid(input.credentialId)
  const kid = `${did}#${did.slice('did:key:'.length)}`
  const hardwareSession = await openHardwareCredentialSigningSession(input.credentialId, 'oid4vci')

  logWalletStep('crypto', 'sign-holder-status-change-pop-hardware-start', {
    credentialId: input.credentialId,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
  })

  try {
    return await signHardwareHolderStatusChangePop({
      nonce: input.nonce,
      audience: input.audience,
      credentialId: input.credentialId,
      holderDid: did,
      kid,
      action: input.action,
      sign: (message) => hardwareSession.sign(message),
    })
  } finally {
    await hardwareSession.close()
  }
}

export type PresentationVpTokenInput = {
  audience: string
  nonce: string
  verifiableCredential: string
  credentialId?: string
}

export type SdJwtKbPresentationTokenInput = {
  audience: string
  nonce: string
  sdJwt: string
  credentialId?: string
}

/**
 * Builds and signs a JWT VP token for OID4VP direct_post.
 * Biometric fires here on every presentation approval.
 */
export async function signPresentationVpToken(input: PresentationVpTokenInput): Promise<string> {
  if (isHardwareP256SigningEnabled()) {
    assertHardwareHolderSigningAllowed(input.credentialId)
  }
  if (shouldUseHardwareCredentialKey(input.credentialId)) {
    const did = resolveHardwareCredentialHolderDid(input.credentialId)
    const kid = `${did}#${did.slice('did:key:'.length)}`
    const hardwareSession = await openHardwareCredentialSigningSession(input.credentialId, 'oid4vp')

    logWalletStep('crypto', 'sign-vp-token-hardware-start', {
      credentialId: input.credentialId,
      kid,
      audience: input.audience,
      noncePresent: Boolean(input.nonce),
      credentialBytes: input.verifiableCredential.length,
    })

    try {
      return await signHardwarePresentationVpToken({
        audience: input.audience,
        nonce: input.nonce,
        verifiableCredential: input.verifiableCredential,
        holderDid: did,
        kid,
        jti: `urn:uuid:${createUuid()}`,
        sign: (message) => hardwareSession.sign(message),
      })
    } finally {
      await hardwareSession.close()
    }
  }

  if (input.credentialId && getCredentialKeyRecord(input.credentialId)) {
    return signPresentationVpTokenWithCredentialKey(input)
  }

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
  if (isHardwareP256SigningEnabled() && seedKind === 'active') {
    const credentialId = requireHardwareCredentialKeyId(input.credentialId)
    const did = resolveHardwareCredentialHolderDid(credentialId)
    const jwk = await readHardwareCredentialSigningPublicJwk(credentialId)
    const kid = `${did}#${did.slice('did:key:'.length)}`
    const cnfKid = assertSdJwtHolderBinding(input.sdJwt, { jwk, kid })
    const hardwareSession = await openHardwareCredentialSigningSession(credentialId, 'oid4vp')

    logWalletStep('crypto', 'sign-sd-jwt-kb-hardware-start', {
      credentialId: input.credentialId,
      kid: cnfKid ?? kid,
      audience: input.audience,
      noncePresent: Boolean(input.nonce),
      sdJwtBytes: input.sdJwt.length,
    })

    try {
      const presentation = await signHardwareSdJwtKbPresentationToken({
        audience: input.audience,
        nonce: input.nonce,
        sdJwt: input.sdJwt,
        holderDid: did,
        kid: cnfKid ?? kid,
        publicJwk: jwk,
        sign: (message) => hardwareSession.sign(message),
      })
      logWalletStep('crypto', 'sign-sd-jwt-kb-hardware-complete', {
        presentationBytes: presentation.length,
      })
      return presentation
    } finally {
      await hardwareSession.close()
    }
  }

  if (input.credentialId && seedKind === 'active' && getCredentialKeyRecord(input.credentialId)) {
    return signSdJwtKbPresentationTokenWithCredentialKey(input)
  }

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
  credentialKeyId?: string,
  seedOverride?: Uint8Array,
  signerOverride?: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>,
): Promise<string> {
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  let signatureBytes: Uint8Array
  try {
    if (credentialKeyId && usesPerCredentialSigning()) {
      signatureBytes = await signWithCredentialKey(credentialKeyId, new TextEncoder().encode(signingInput))
    } else if (signerOverride) {
      signatureBytes = await signerOverride(new TextEncoder().encode(signingInput))
    } else {
      const service = seedKind === 'previous' ? PREVIOUS_KEYCHAIN_SERVICE : KEYCHAIN_SERVICE
      const promptTitle =
        seedKind === 'previous' ? 'Sign with Previous Wallet Key' : 'Sign with Wallet Key'
      const signingSeed = seedOverride ?? await readStoredEd25519Seed(service, promptTitle)
      if (!signingSeed) {
        throw new Error(seedKind === 'previous' ? 'PreviousWalletKeyNotInitialized' : 'WalletKeyNotInitialized')
      }
      try {
        signatureBytes = sign(new TextEncoder().encode(signingInput), signingSeed)
      } finally {
        if (!seedOverride) {
          signingSeed.fill(0)
        }
      }
    }
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

  throw new Error(
    `PresentationCredentialHolderBindingMismatch: expected=${formatWalletHolderBindingHint(holder.jwk as Record<string, unknown>, holder.kid)}; got=${formatCredentialCnfHint(cnfJwk, cnfKid)}`,
  )
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
