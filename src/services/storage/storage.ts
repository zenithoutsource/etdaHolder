import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'
import type { MMKV } from 'react-native-mmkv'
import { createMMKV } from 'react-native-mmkv'
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'react-native-quick-crypto'
import { Buffer } from '@craftzdog/react-native-buffer'

import { confirmBiometricGate } from '@/src/services/auth/biometricGate'
import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { toErrorMessage } from '@/src/utils/jwtUtils'

const KEYCHAIN_SERVICE = 'etda.wallet.credential_storage_key'
const KEYCHAIN_USERNAME = 'wallet-credentials'
const META_STORAGE_ID = 'wallet-meta'
const CREDENTIAL_STORAGE_ID = 'wallet-credentials'
const MMKV_AES_256_KEY_BYTES = 32
const RANDOM_BYTES_FOR_BASE64_KEY = 24
const PIN_FALLBACK_META_KEY = 'wallet:storage-pin-fallback:v1'
const WALLET_PIN_META_KEY = 'wallet:pin-meta:v1'
const WALLET_PIN_CREDENTIAL_KEY = 'wallet:pin:v1'
const ANDROID_NO_AUTH_MIGRATION_KEY = 'wallet:android-storage-no-auth:v1'
const PIN_FALLBACK_VERSION = 1
const PIN_LENGTH = 6
const PIN_KDF_ITERATIONS = 210_000
const PIN_KDF_BYTES = 32
const AES_GCM_IV_BYTES = 12

const metaStorage = createMMKV({ id: META_STORAGE_ID })
let credentialStorage: MMKV | null = null
let credentialEncryptionKey: string | null = null
let initStoragePromise: Promise<void> | null = null

type StoragePinFallbackRecord = {
  version: 1
  kdf: 'pbkdf2-sha256'
  iterations: number
  salt: string
  verifier: string
  iv: string
  ciphertext: string
  authTag: string
}

type WalletPinMetaRecord = {
  salt: string
  hash: string
}

function hashWalletPinMeta(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

function readWalletPinMetaRecord(): WalletPinMetaRecord | undefined {
  const raw = metaStorage.getString(WALLET_PIN_META_KEY)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<WalletPinMetaRecord>
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return { salt: parsed.salt, hash: parsed.hash }
    }
  } catch {
    return undefined
  }

  return undefined
}

function generateEncryptionKey(): string {
  const key = randomBytes(RANDOM_BYTES_FOR_BASE64_KEY).toString('base64')
  if (key.length !== MMKV_AES_256_KEY_BYTES) {
    throw new Error(`InvalidStorageKeyLength: expected ${MMKV_AES_256_KEY_BYTES}, got ${key.length}`)
  }
  return key
}

function isSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

function derivePinFallbackKey(pin: string, salt: string, iterations: number): Uint8Array {
  // Native (JSI) PBKDF2 instead of @noble/hashes' pure-JS loop: the latter took
  // ~10s on-device at 210k iterations, blocking the JS thread during PIN unlock.
  return pbkdf2Sync(pin, salt, iterations, PIN_KDF_BYTES, 'sha256')
}

function readPinFallbackRecord(): StoragePinFallbackRecord | undefined {
  const raw = metaStorage.getString(PIN_FALLBACK_META_KEY)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<StoragePinFallbackRecord>
    if (
      parsed.version === PIN_FALLBACK_VERSION &&
      parsed.kdf === 'pbkdf2-sha256' &&
      typeof parsed.iterations === 'number' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.verifier === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ciphertext === 'string' &&
      typeof parsed.authTag === 'string'
    ) {
      return parsed as StoragePinFallbackRecord
    }
  } catch {
    return undefined
  }

  return undefined
}

function createPinVerifier(derivedKey: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(derivedKey).toString('base64')).digest('hex')
}

function openCredentialStorage(encryptionKey: string): void {
  credentialStorage = createMMKV({
    id: CREDENTIAL_STORAGE_ID,
    encryptionKey,
    encryptionType: 'AES-256',
  })
  credentialEncryptionKey = encryptionKey
}

function readErrorField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[field] : undefined
}

function isKeychainPromptCancellation(error: unknown): boolean {
  const code = readErrorField(error, 'code')
  const name = String(readErrorField(error, 'name') ?? '')
  const message = toErrorMessage(error)
  const hasNativeCancelCode = /code:\s*(10|13)\b/i.test(message)
  const hasCancelText = /\bCancel(?:led|ed)?\b/i.test(message) || message.includes('ยกเลิก')

  if (code === 'E_USER_CANCELED' || code === 'USER_CANCELED') return true

  return (
    code === 'E_CRYPTO_FAILED' &&
    name.includes('CryptoFailedException') &&
    hasNativeCancelCode &&
    (hasCancelText || /code:\s*10\b/i.test(message))
  )
}

const STORAGE_BIOMETRIC_TITLE = 'ปลดล็อกพื้นที่จัดเก็บ Wallet'
const STORAGE_BIOMETRIC_CANCEL = 'ยกเลิก'

async function migrateAndroidKeychainToNoAuthIfNeeded(encryptionKey: string): Promise<void> {
  if (Platform.OS !== 'android' || isBiometricDisabledForTesting()) return
  if (metaStorage.getString(ANDROID_NO_AUTH_MIGRATION_KEY) === 'true') return

  const result = await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  if (!result) {
    logWalletError('storage', 'android-no-auth-migration-reset-failed', new Error('KeychainResetFailed'))
    return
  }

  const writeResult = await Keychain.setGenericPassword(
    KEYCHAIN_USERNAME,
    encryptionKey,
    getKeychainSetOptions(),
  )
  if (!writeResult) {
    logWalletError('storage', 'android-no-auth-migration-write-failed', new Error('KeychainWriteFailed'))
    return
  }

  metaStorage.set(ANDROID_NO_AUTH_MIGRATION_KEY, 'true')
  logWalletStep('storage', 'android-no-auth-migration-complete')
}

function getKeychainSetOptions(): Keychain.SetOptions {
  if (isBiometricDisabledForTesting()) {
    return {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }
  }

  if (Platform.OS === 'android') {
    return {
      service: KEYCHAIN_SERVICE,
      securityLevel: __DEV__
        ? Keychain.SECURITY_LEVEL.SECURE_SOFTWARE
        : Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      // App-level weak biometric gate (face + fingerprint) runs before reads; avoid a second
      // Keychain prompt that is often fingerprint-only on Android.
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
    }
  }
  return {
    service: KEYCHAIN_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }
}

function getKeychainGetOptions(): Keychain.GetOptions {
  if (isBiometricDisabledForTesting()) {
    return {
      service: KEYCHAIN_SERVICE,
    }
  }

  if (Platform.OS === 'android') {
    return {
      service: KEYCHAIN_SERVICE,
    }
  }
  return {
    service: KEYCHAIN_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    authenticationPrompt: {
      title: 'Unlock Wallet Storage',
      cancel: 'Cancel',
    },
  }
}

async function getOrCreateEncryptionKey(): Promise<{ encryptionKey: string; isNewKey: boolean }> {
  if (Platform.OS === 'android' && !isBiometricDisabledForTesting()) {
    await confirmBiometricGate({
      promptMessage: STORAGE_BIOMETRIC_TITLE,
      cancelButtonText: STORAGE_BIOMETRIC_CANCEL,
      logScope: 'storage',
      errorPrefix: 'StorageUnlock',
      allowFallback: false,
    })
  }

  logWalletStep('storage', 'keychain-read-start')
  const credentials = await Keychain.getGenericPassword(getKeychainGetOptions())

  if (credentials) {
    if (credentials.password.length !== MMKV_AES_256_KEY_BYTES) {
      throw new Error(
        `InvalidStoredStorageKeyLength: expected ${MMKV_AES_256_KEY_BYTES}, got ${credentials.password.length}`
      )
    }
    logWalletStep('storage', 'keychain-existing-key')
    return { encryptionKey: credentials.password, isNewKey: false }
  }

  logWalletStep('storage', 'keychain-generate-key')
  const encryptionKey = generateEncryptionKey()
  const result = await Keychain.setGenericPassword(
    KEYCHAIN_USERNAME,
    encryptionKey,
    getKeychainSetOptions()
  )

  if (!result) throw new Error('KeychainWriteFailed')
  logWalletStep('storage', 'keychain-write-complete')
  return { encryptionKey, isNewKey: true }
}

/**
 * Must be called once at app startup before any credential read/write.
 * Biometric/device auth may fire when the MMKV key is retrieved from Keychain.
 */
export async function initStorage(): Promise<void> {
  if (credentialStorage !== null) {
    logWalletStep('storage', 'init-cache-hit')
    return
  }

  if (initStoragePromise) {
    logWalletStep('storage', 'init-in-flight')
    return initStoragePromise
  }

  initStoragePromise = initializeStorage()
  try {
    await initStoragePromise
  } finally {
    initStoragePromise = null
  }
}

async function initializeStorage(): Promise<void> {
  try {
    logWalletStep('storage', 'init-start')
    const { encryptionKey, isNewKey } = await getOrCreateEncryptionKey()
    openCredentialStorage(encryptionKey)
    if (!isNewKey) {
      await migrateAndroidKeychainToNoAuthIfNeeded(encryptionKey)
    }
    syncWalletPinMetaFromCredentialStorage()
    logWalletStep('storage', 'init-complete', { storageId: CREDENTIAL_STORAGE_ID })
  } catch (error) {
    if (credentialStorage === null) {
      credentialEncryptionKey = null
    }
    if (isKeychainPromptCancellation(error)) {
      logWalletStep('storage', 'unlock-cancelled', error)
      throw new Error('StorageUnlockCancelled')
    }
    if (error instanceof Error && error.message === 'StorageUnlockCancelled') {
      logWalletStep('storage', 'unlock-cancelled', error)
      throw error
    }
    credentialStorage = null
    credentialEncryptionKey = null
    logWalletError('storage', 'init-failed', error)
    throw new Error(`StorageInitializationFailed: ${toErrorMessage(error)}`)
  }
}

export function isStoragePinFallbackAvailable(): boolean {
  return readPinFallbackRecord() !== undefined
}

export function canVerifyStoragePinUnlock(): boolean {
  return hasWalletPinMeta() || isStoragePinFallbackAvailable()
}

export function hasWalletPinMeta(): boolean {
  return readWalletPinMetaRecord() !== undefined
}

function hasWalletPinRecordInCredentialStorage(): boolean {
  if (!credentialStorage) return false

  const raw = credentialStorage.getString(WALLET_PIN_CREDENTIAL_KEY)
  if (!raw) return false

  try {
    const parsed = JSON.parse(raw) as Partial<WalletPinMetaRecord>
    return typeof parsed.salt === 'string' && typeof parsed.hash === 'string'
  } catch {
    return false
  }
}

export function needsStoragePinFallbackMigration(): boolean {
  return hasWalletPinRecordInCredentialStorage() && !isStoragePinFallbackAvailable()
}

export function persistWalletPinMeta(record: WalletPinMetaRecord): void {
  metaStorage.set(WALLET_PIN_META_KEY, JSON.stringify(record))
  logWalletStep('storage', 'wallet-pin-meta-persisted')
}

export function verifyWalletPinMeta(pin: string): boolean {
  if (!isSixDigitPin(pin)) return false

  const stored = readWalletPinMetaRecord()
  if (!stored) return false

  return hashWalletPinMeta(pin, stored.salt) === stored.hash
}

export function syncWalletPinMetaFromCredentialStorage(): void {
  if (hasWalletPinMeta() || !credentialStorage) return

  const raw = credentialStorage.getString(WALLET_PIN_CREDENTIAL_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as Partial<WalletPinMetaRecord>
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      persistWalletPinMeta({ salt: parsed.salt, hash: parsed.hash })
      logWalletStep('storage', 'wallet-pin-meta-synced-from-credential')
    }
  } catch {
    return
  }
}

export function provisionStoragePinFallback(pin: string): void {
  if (!isSixDigitPin(pin)) {
    throw new Error(`InvalidWalletPin: expected ${PIN_LENGTH} digits`)
  }
  if (!credentialEncryptionKey) {
    throw new Error('StorageNotInitialized')
  }

  const salt = randomBytes(16).toString('base64')
  const iv = randomBytes(AES_GCM_IV_BYTES)
  const derivedKey = derivePinFallbackKey(pin, salt, PIN_KDF_ITERATIONS)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(derivedKey), iv)
  const ciphertext = Buffer.concat([
    cipher.update(credentialEncryptionKey, 'utf8'),
    cipher.final(),
  ])
  const record: StoragePinFallbackRecord = {
    version: PIN_FALLBACK_VERSION,
    kdf: 'pbkdf2-sha256',
    iterations: PIN_KDF_ITERATIONS,
    salt,
    verifier: createPinVerifier(derivedKey),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }

  metaStorage.set(PIN_FALLBACK_META_KEY, JSON.stringify(record))
  logWalletStep('storage', 'pin-fallback-provisioned')
}

export async function initStorageWithPin(pin: string): Promise<void> {
  if (!isSixDigitPin(pin)) {
    throw new Error(`InvalidWalletPin: expected ${PIN_LENGTH} digits`)
  }
  if (credentialStorage !== null) {
    logWalletStep('storage', 'init-cache-hit')
    return
  }

  if (hasWalletPinMeta() && !verifyWalletPinMeta(pin)) {
    throw new Error('StoragePinVerifierMismatch')
  }

  const record = readPinFallbackRecord()
  if (!record) {
    if (verifyWalletPinMeta(pin)) {
      throw new Error('StoragePinFallbackRequired')
    }
    throw new Error('StoragePinFallbackUnavailable')
  }

  try {
    const derivedKey = derivePinFallbackKey(pin, record.salt, record.iterations)
    if (createPinVerifier(derivedKey) !== record.verifier) {
      throw new Error('StoragePinVerifierMismatch')
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(derivedKey),
      Buffer.from(record.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))
    const encryptionKey = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')

    if (encryptionKey.length !== MMKV_AES_256_KEY_BYTES) {
      throw new Error(
        `InvalidStoredStorageKeyLength: expected ${MMKV_AES_256_KEY_BYTES}, got ${encryptionKey.length}`
      )
    }

    openCredentialStorage(encryptionKey)
    logWalletStep('storage', 'pin-fallback-init-complete', { storageId: CREDENTIAL_STORAGE_ID })
  } catch (error) {
    credentialStorage = null
    credentialEncryptionKey = null
    if (error instanceof Error && error.message === 'StoragePinVerifierMismatch') {
      logWalletStep('storage', 'pin-fallback-verifier-mismatch')
      throw error
    }
    logWalletError('storage', 'pin-fallback-init-failed', error)
    throw new Error('StoragePinUnlockFailed')
  }
}

export function getMetaStorage(): MMKV {
  return metaStorage
}

/** Throws `StorageNotInitialized` if called before `initStorage()`. */
export function getCredentialStorage(): MMKV {
  if (!credentialStorage) throw new Error('StorageNotInitialized')
  return credentialStorage
}

/** Wipes keychain entry and forgets the encrypted credential storage instance. */
export async function resetStorage(options: { keepPinFallback?: boolean } = {}): Promise<void> {
  logWalletStep('storage', 'reset-start')
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  if (!options.keepPinFallback) {
    metaStorage.remove(PIN_FALLBACK_META_KEY)
  }
  metaStorage.remove(WALLET_PIN_META_KEY)
  metaStorage.remove(ANDROID_NO_AUTH_MIGRATION_KEY)
  initStoragePromise = null
  credentialStorage = null
  credentialEncryptionKey = null
  logWalletStep('storage', 'reset-complete')
}
