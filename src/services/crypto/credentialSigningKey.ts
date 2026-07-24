import { getPublicKey, hashes, sign } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { randomBytes } from 'react-native-quick-crypto'
import * as Keychain from 'react-native-keychain'

import { readIssuancePendingKeyTtlMs } from '@/src/config/walletCryptoPolicy'
import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getMetaStorage } from '../storage/storage'
import {
  getCredentialKeyRecord,
  registerCredentialKey,
  removeCredentialKeyRecord,
  type CredentialKeyRecord,
} from './credentialKeyRegistry'

hashes.sha512 = sha512

const CREDENTIAL_KEYCHAIN_PREFIX = 'wallet.ed25519_seed.cred.'
const PENDING_META_PREFIX = 'wallet.pending_credential_keys.'
const KEYCHAIN_USERNAME = 'wallet-ed25519-credential-seed'

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function credentialKeychainService(id: string): string {
  return `${CREDENTIAL_KEYCHAIN_PREFIX}${id}`
}

function pendingMetaKey(pendingId: string): string {
  return `${PENDING_META_PREFIX}${pendingId}`
}

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

export function ed25519PublicKeyToDidKey(publicKey: Uint8Array): string {
  assertEd25519PublicKeyLength(publicKey)
  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(publicKey, ED25519_MULTICODEC_PREFIX.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
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

function getKeychainGetOptions(service: string, promptTitle?: string): Keychain.GetOptions {
  if (isBiometricDisabledForTesting()) {
    return { service }
  }

  return {
    service,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    authenticationPrompt: {
      title: promptTitle ?? 'Sign with Credential Key',
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

async function writeEd25519Seed(seed: Uint8Array, service: string): Promise<void> {
  assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
  const result = await Keychain.setGenericPassword(
    KEYCHAIN_USERNAME,
    uint8ArrayToBase64(seed),
    getKeychainSetOptions(service),
  )
  if (!result) throw new Error('Ed25519SeedKeychainWriteFailed')
}

function createPendingId(): string {
  const bytes = randomBytes(16)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type PendingKeyMeta = {
  pendingId: string
  createdAt: string
}

function readPendingKeyMeta(pendingId: string): PendingKeyMeta | undefined {
  const raw = getMetaStorage().getString(pendingMetaKey(pendingId))
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<PendingKeyMeta>
    if (typeof parsed.pendingId === 'string' && typeof parsed.createdAt === 'string') {
      return parsed as PendingKeyMeta
    }
  } catch {
    return undefined
  }
  return undefined
}

function writePendingKeyMeta(meta: PendingKeyMeta): void {
  getMetaStorage().set(pendingMetaKey(meta.pendingId), JSON.stringify(meta))
}

function removePendingKeyMeta(pendingId: string): void {
  getMetaStorage().remove(pendingMetaKey(pendingId))
}

export async function createPendingCredentialKey(now = new Date()): Promise<string> {
  const pendingId = createPendingId()
  const seed = randomBytes(32)
  assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
  await writeEd25519Seed(seed, credentialKeychainService(pendingId))
  writePendingKeyMeta({ pendingId, createdAt: now.toISOString() })
  logWalletStep('crypto', 'credential-pending-key-created', { pendingId })
  return pendingId
}

export async function bindPendingKeyToCredential(
  pendingId: string,
  credentialId: string,
  credentialType: string,
  now = new Date(),
): Promise<CredentialKeyRecord> {
  const pendingMeta = readPendingKeyMeta(pendingId)
  if (!pendingMeta) {
    throw new Error('PendingCredentialKeyNotFound')
  }

  const pendingService = credentialKeychainService(pendingId)
  const seed = await readStoredEd25519Seed(pendingService)
  if (!seed) {
    throw new Error('PendingCredentialKeySeedMissing')
  }

  const credentialService = credentialKeychainService(credentialId)
  await writeEd25519Seed(seed, credentialService)
  await Keychain.resetGenericPassword({ service: pendingService }).catch(() => undefined)
  removePendingKeyMeta(pendingId)

  const publicKey = getPublicKey(seed)
  assertEd25519PublicKeyLength(publicKey)
  const holderDid = ed25519PublicKeyToDidKey(publicKey)
  const record: CredentialKeyRecord = {
    credentialId,
    holderDid,
    keychainService: credentialService,
    credentialType,
    createdAt: now.toISOString(),
  }
  registerCredentialKey(record)
  logWalletStep('crypto', 'credential-key-bound', { credentialId, credentialType })
  return record
}

export function getCredentialHolderDid(credentialId: string): string {
  const record = getCredentialKeyRecord(credentialId)
  if (!record) throw new Error('CredentialKeyNotFound')
  return record.holderDid
}

function publicKeyToEd25519Jwk(publicKey: Uint8Array): JsonWebKey {
  assertEd25519PublicKeyLength(publicKey)
  let binary = ''
  for (let i = 0; i < publicKey.length; i++) binary += String.fromCharCode(publicKey[i])
  const x = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return { kty: 'OKP', crv: 'Ed25519', x }
}

function resolveKeychainServiceForKey(keyId: string): string | undefined {
  const record = getCredentialKeyRecord(keyId)
  if (record) return record.keychainService
  if (readPendingKeyMeta(keyId)) return credentialKeychainService(keyId)
  return undefined
}

export async function readCredentialSigningPublicJwk(keyId: string): Promise<JsonWebKey> {
  const service = resolveKeychainServiceForKey(keyId)
  if (!service) throw new Error('CredentialKeyNotFound')

  const seed = await readStoredEd25519Seed(service)
  if (!seed) throw new Error('CredentialKeySeedMissing')
  return publicKeyToEd25519Jwk(getPublicKey(seed))
}

export async function getCredentialSigningHolderDid(keyId: string): Promise<string> {
  const record = getCredentialKeyRecord(keyId)
  if (record) return record.holderDid

  const service = resolveKeychainServiceForKey(keyId)
  if (!service) throw new Error('CredentialKeyNotFound')

  const seed = await readStoredEd25519Seed(service)
  if (!seed) throw new Error('CredentialKeySeedMissing')
  return ed25519PublicKeyToDidKey(getPublicKey(seed))
}

export async function signWithCredentialKey(credentialId: string, message: Uint8Array): Promise<Uint8Array> {
  const service = resolveKeychainServiceForKey(credentialId)
  if (!service) throw new Error('CredentialKeyNotFound')

  try {
    const seed = await readStoredEd25519Seed(service, 'Sign with Credential Key')
    if (!seed) throw new Error('CredentialKeySeedMissing')
    const signature = sign(message, seed)
    if (signature.length !== 64) {
      throw new Error(`InvalidSignatureLength: expected 64 Ed25519 bytes, got ${signature.length}`)
    }
    logWalletStep('crypto', 'credential-key-sign-complete', { credentialId })
    return signature
  } catch (error) {
    logWalletError('crypto', 'credential-key-sign-failed', error, { credentialId })
    throw error
  }
}

export async function destroyCredentialKey(credentialId: string): Promise<void> {
  const record = getCredentialKeyRecord(credentialId)
  if (!record) return

  await Keychain.resetGenericPassword({ service: record.keychainService }).catch(() => undefined)
  removeCredentialKeyRecord(credentialId)
  logWalletStep('crypto', 'credential-key-destroyed', { credentialId })
}

export function gcStalePendingKeys(now = new Date()): number {
  const storage = getMetaStorage()
  const keys = storage.getAllKeys?.() ?? []
  const ttlMs = readIssuancePendingKeyTtlMs()
  const cutoff = now.getTime() - ttlMs
  let removed = 0

  for (const key of keys) {
    if (!key.startsWith(PENDING_META_PREFIX)) continue
    const pendingId = key.slice(PENDING_META_PREFIX.length)
    const meta = readPendingKeyMeta(pendingId)
    if (!meta) {
      storage.remove(key)
      continue
    }

    const createdAtMs = new Date(meta.createdAt).getTime()
    if (Number.isNaN(createdAtMs) || createdAtMs < cutoff) {
      void Keychain.resetGenericPassword({ service: credentialKeychainService(pendingId) }).catch(() => undefined)
      removePendingKeyMeta(pendingId)
      removed++
    }
  }

  if (removed > 0) {
    logWalletStep('crypto', 'credential-pending-keys-gc', { removed })
  }

  return removed
}
