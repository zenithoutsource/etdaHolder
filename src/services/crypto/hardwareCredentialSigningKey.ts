import { randomBytes } from 'react-native-quick-crypto'

import { isHardwareP256SigningEnabled, readDefaultMaxSignatures } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { getMetaStorage } from '@/src/services/storage/storage'

import {
  bindPendingCredentialAlias,
  destroyEncryptedCredentialKey,
  getEncryptedCredentialKeyRecord,
  type EncryptedCredentialKeyRecord,
} from './encryptedCredentialKeyRegistry'
import { seedInitialWalletKeyRegisteredAt } from './walletKeyRegistration'
import { getHardwareEcdsaSigner } from './hardwareEcdsaSigner'
import type {
  EcP256Jwk,
  HardwareSecurityLevel,
  HardwareSigningPurpose,
  HardwareSigningSession,
} from './hardwareEcdsaTypes'
import { pendingCredentialAlias } from './hardwareEcdsaTypes'
import {
  p256JwkToPublicKey,
  p256PublicKeyToDidKey,
  p256PublicKeyToJwk,
} from './p256Identity'
import { deleteLegacyEd25519KeysForCutover } from './credentialSigningKey'

const PENDING_META_PREFIX = 'wallet.pending_hardware_credential_keys.'
const PENDING_KEY_GC_META_KEY = 'wallet.hardware_pending_key_gc'
const REPLACEMENT_PREFIX = 'wallet.p256.credential_key_replacements.'

type PendingHardwareKeyMeta = {
  pendingId: string
  alias: string
  holderDid: string
  publicJwk: EcP256Jwk
  securityLevel: HardwareSecurityLevel
  createdAt: string
}

type PendingHardwareKeyGcEntry = {
  pendingId: string
  alias: string
}

function pendingMetaKey(pendingId: string): string {
  return `${PENDING_META_PREFIX}${pendingId}`
}

function createPendingId(): string {
  const bytes = randomBytes(16)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readPendingHardwareKeyMeta(pendingId: string): PendingHardwareKeyMeta | undefined {
  const raw = getMetaStorage().getString(pendingMetaKey(pendingId))
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<PendingHardwareKeyMeta>
    if (
      typeof parsed.pendingId === 'string' &&
      typeof parsed.alias === 'string' &&
      typeof parsed.holderDid === 'string' &&
      typeof parsed.createdAt === 'string' &&
      parsed.publicJwk &&
      typeof parsed.publicJwk.kty === 'string' &&
      (parsed.securityLevel === 'STRONGBOX' || parsed.securityLevel === 'TEE')
    ) {
      return parsed as PendingHardwareKeyMeta
    }
  } catch {
    return undefined
  }
  return undefined
}

function writePendingHardwareKeyMeta(meta: PendingHardwareKeyMeta): void {
  getMetaStorage().set(pendingMetaKey(meta.pendingId), JSON.stringify(meta))
}

function removePendingHardwareKeyMeta(pendingId: string): void {
  getMetaStorage().remove(pendingMetaKey(pendingId))
}

function replacementMetaKey(credentialId: string): string {
  return `${REPLACEMENT_PREFIX}${credentialId}`
}

function parseHardwareKeyReplacement(raw: string): EncryptedCredentialKeyRecord | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<EncryptedCredentialKeyRecord>
    if (
      typeof parsed.credentialId === 'string' &&
      typeof parsed.holderDid === 'string' &&
      typeof parsed.alias === 'string' &&
      typeof parsed.credentialType === 'string' &&
      typeof parsed.createdAt === 'string' &&
      (parsed.securityLevelHint === 'STRONGBOX' || parsed.securityLevelHint === 'TEE')
    ) {
      return parsed as EncryptedCredentialKeyRecord
    }
  } catch {
    return undefined
  }
  return undefined
}

export function getHardwareCredentialKeyReplacement(
  credentialId: string,
): EncryptedCredentialKeyRecord | undefined {
  const raw = getMetaStorage().getString(replacementMetaKey(credentialId))
  if (!raw) return undefined
  return parseHardwareKeyReplacement(raw)
}

function writeHardwareCredentialKeyReplacement(record: EncryptedCredentialKeyRecord): void {
  getMetaStorage().set(replacementMetaKey(record.credentialId), JSON.stringify(record))
}

function removeHardwareCredentialKeyReplacement(credentialId: string): void {
  getMetaStorage().remove(replacementMetaKey(credentialId))
}

export function hasHardwareCredentialKey(keyId: string): boolean {
  try {
    if (getEncryptedCredentialKeyRecord(keyId)) return true
  } catch (error) {
    logWalletError('hardware-ecdsa', 'hardware-credential-key-lookup-failed', error, { keyId })
  }
  return Boolean(readPendingHardwareKeyMeta(keyId))
}

/** Hardware-on credentials without a P-256 k_cred must not sign; they need fresh reissue. */
export function credentialRequiresHardwareReissue(credentialId: string): boolean {
  if (!isHardwareP256SigningEnabled()) return false
  return !hasHardwareCredentialKey(credentialId)
}

function readPendingKeyGcQueue(): PendingHardwareKeyGcEntry[] {
  const raw = getMetaStorage().getString(PENDING_KEY_GC_META_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is PendingHardwareKeyGcEntry => {
      if (!entry || typeof entry !== 'object') return false
      const record = entry as Partial<PendingHardwareKeyGcEntry>
      return typeof record.pendingId === 'string' && typeof record.alias === 'string'
    })
  } catch {
    return []
  }
}

function writePendingKeyGcQueue(entries: PendingHardwareKeyGcEntry[]): void {
  if (entries.length === 0) {
    getMetaStorage().remove(PENDING_KEY_GC_META_KEY)
    return
  }
  getMetaStorage().set(PENDING_KEY_GC_META_KEY, JSON.stringify(entries))
}

function enqueuePendingKeyGc(entry: PendingHardwareKeyGcEntry): void {
  const queue = readPendingKeyGcQueue()
  if (queue.some((item) => item.pendingId === entry.pendingId && item.alias === entry.alias)) return
  writePendingKeyGcQueue([...queue, entry])
}

export async function sweepPendingHardwareKeyGc(): Promise<void> {
  const queue = readPendingKeyGcQueue()
  if (queue.length === 0) return

  const signer = getHardwareEcdsaSigner()
  const remaining: PendingHardwareKeyGcEntry[] = []
  for (const entry of queue) {
    try {
      if (await signer.hasKey(entry.alias)) {
        await signer.deleteKey(entry.alias)
      }
      removePendingHardwareKeyMeta(entry.pendingId)
    } catch (error) {
      logWalletError('hardware-ecdsa', 'hardware-credential-pending-key-gc-failed', error, {
        pendingId: entry.pendingId,
      })
      remaining.push(entry)
    }
  }
  writePendingKeyGcQueue(remaining)
}

function resolveAliasForKey(keyId: string): string | undefined {
  const bound = getEncryptedCredentialKeyRecord(keyId)
  if (bound) return bound.alias
  return readPendingHardwareKeyMeta(keyId)?.alias
}

export type HardwareCredentialKeySigningSession = {
  credentialKeyId: string
  publicJwk: EcP256Jwk
  holderDid: string
  hardwareSession: HardwareSigningSession
  sign: (message: Uint8Array) => Promise<Uint8Array>
  bindCredentialKey: (credentialId: string, credentialType: string) => Promise<EncryptedCredentialKeyRecord>
  close: () => Promise<void>
}

export async function createPendingHardwareCredentialKey(now = new Date()): Promise<string> {
  await sweepPendingHardwareKeyGc()
  const pendingId = createPendingId()
  const alias = pendingCredentialAlias(pendingId)
  const signer = getHardwareEcdsaSigner()

  try {
    const created = await signer.createKey(alias)
    const publicKey = p256JwkToPublicKey(created.publicJwk)
    const holderDid = p256PublicKeyToDidKey(publicKey)

    writePendingHardwareKeyMeta({
      pendingId,
      alias,
      holderDid,
      publicJwk: created.publicJwk,
      securityLevel: created.securityLevel,
      createdAt: now.toISOString(),
    })

    logWalletStep('hardware-ecdsa', 'hardware-credential-pending-key-created', {
      pendingId,
      alias,
      securityLevel: created.securityLevel,
      holderDidPrefix: holderDid.slice(0, 24),
    })
    return pendingId
  } catch (error) {
    try {
      if (await signer.hasKey(alias)) {
        await signer.deleteKey(alias)
      }
    } catch (cleanupError) {
      logWalletError('hardware-ecdsa', 'hardware-credential-pending-key-rollback-failed', cleanupError, {
        pendingId,
      })
    }
    throw error
  }
}

export async function openHardwareCredentialSigningSession(
  keyId: string,
  purpose: HardwareSigningPurpose,
  maxSignatures = readDefaultMaxSignatures(purpose),
): Promise<HardwareSigningSession> {
  const alias = resolveAliasForKey(keyId)
  if (!alias) throw new Error('HardwareCredentialKeyNotFound')

  const signer = getHardwareEcdsaSigner()
  return signer.openSigningSession(alias, { purpose, maxSignatures })
}

export async function createHardwarePendingCredentialKeySession(
  purpose: HardwareSigningPurpose = 'oid4vci',
  now = new Date(),
): Promise<HardwareCredentialKeySigningSession> {
  const pendingId = await createPendingHardwareCredentialKey(now)
  const meta = readPendingHardwareKeyMeta(pendingId)
  if (!meta) throw new Error('PendingHardwareCredentialKeyNotFound')

  const hardwareSession = await openHardwareCredentialSigningSession(
    pendingId,
    purpose,
    readDefaultMaxSignatures(purpose),
  )

  let closed = false

  return {
    credentialKeyId: pendingId,
    publicJwk: meta.publicJwk,
    holderDid: meta.holderDid,
    hardwareSession,
    sign: async (message) => {
      if (closed) throw new Error('HardwareCredentialKeySigningSessionClosed')
      return hardwareSession.sign(message)
    },
    bindCredentialKey: async (credentialId, credentialType) =>
      bindPendingHardwareKeyToCredential(pendingId, credentialId, credentialType, now),
    close: async () => {
      if (closed) return
      closed = true
      try {
        await hardwareSession.close()
      } catch (error) {
        logWalletError('hardware-ecdsa', 'hardware-credential-session-close-failed', error, { pendingId })
        throw error
      }
    },
  }
}

export async function bindPendingHardwareKeyToCredential(
  pendingId: string,
  credentialId: string,
  credentialType: string,
  now = new Date(),
): Promise<EncryptedCredentialKeyRecord> {
  const meta = readPendingHardwareKeyMeta(pendingId)
  if (!meta) throw new Error('PendingHardwareCredentialKeyNotFound')

  const signer = getHardwareEcdsaSigner()
  if (!(await signer.hasKey(meta.alias))) {
    throw new Error('HardwareCredentialKeyAliasMissing')
  }

  const existing = getEncryptedCredentialKeyRecord(credentialId)
  if (existing && existing.alias !== meta.alias) {
    writeHardwareCredentialKeyReplacement({
      credentialId,
      alias: meta.alias,
      holderDid: meta.holderDid,
      credentialType,
      securityLevelHint: meta.securityLevel,
      createdAt: now.toISOString(),
    })
    removePendingHardwareKeyMeta(pendingId)
    logWalletStep('hardware-ecdsa', 'hardware-credential-key-replacement-staged', {
      credentialId,
      credentialType,
    })
    try {
      await deleteLegacyEd25519KeysForCutover({ credentialId, credentialType })
    } catch (error) {
      logWalletError('hardware-ecdsa', 'legacy-ed25519-cutover-delete-failed', error, {
        credentialId,
        credentialType,
      })
    }
    return existing
  }

  const record = bindPendingCredentialAlias({
    credentialId,
    alias: meta.alias,
    holderDid: meta.holderDid,
    credentialType,
    securityLevelHint: meta.securityLevel,
    createdAt: now.toISOString(),
  })
  seedInitialWalletKeyRegisteredAt(record.createdAt)

  removePendingHardwareKeyMeta(pendingId)
  logWalletStep('hardware-ecdsa', 'hardware-credential-key-bound', { credentialId, credentialType })
  try {
    await deleteLegacyEd25519KeysForCutover({ credentialId, credentialType })
  } catch (error) {
    logWalletError('hardware-ecdsa', 'legacy-ed25519-cutover-delete-failed', error, {
      credentialId,
      credentialType,
    })
  }
  return record
}

export async function commitHardwareCredentialKeyReplacement(credentialId: string): Promise<void> {
  const replacement = getHardwareCredentialKeyReplacement(credentialId)
  if (!replacement) return

  const existing = getEncryptedCredentialKeyRecord(credentialId)
  bindPendingCredentialAlias({
    credentialId: replacement.credentialId,
    alias: replacement.alias,
    holderDid: replacement.holderDid,
    credentialType: replacement.credentialType,
    securityLevelHint: replacement.securityLevelHint,
    createdAt: replacement.createdAt,
  })
  removeHardwareCredentialKeyReplacement(credentialId)

  if (existing && existing.alias !== replacement.alias) {
    const signer = getHardwareEcdsaSigner()
    try {
      if (await signer.hasKey(existing.alias)) {
        await signer.deleteKey(existing.alias)
      }
    } catch (error) {
      logWalletError('hardware-ecdsa', 'hardware-credential-previous-alias-delete-failed', error, {
        credentialId,
        alias: existing.alias,
      })
      enqueuePendingKeyGc({ pendingId: `previous:${credentialId}`, alias: existing.alias })
    }
  }

  logWalletStep('hardware-ecdsa', 'hardware-credential-key-replacement-committed', { credentialId })
  try {
    await deleteLegacyEd25519KeysForCutover({
      credentialId,
      credentialType: replacement.credentialType,
    })
  } catch (error) {
    logWalletError('hardware-ecdsa', 'legacy-ed25519-cutover-delete-failed', error, { credentialId })
  }
}

export async function discardHardwareCredentialKeyReplacement(credentialId: string): Promise<boolean> {
  const replacement = getHardwareCredentialKeyReplacement(credentialId)
  if (!replacement) return false

  const signer = getHardwareEcdsaSigner()
  try {
    if (await signer.hasKey(replacement.alias)) {
      await signer.deleteKey(replacement.alias)
    }
  } catch (error) {
    logWalletError('hardware-ecdsa', 'hardware-credential-key-replacement-discard-failed', error, {
      credentialId,
    })
    enqueuePendingKeyGc({ pendingId: `replacement:${credentialId}`, alias: replacement.alias })
    return true
  }

  removeHardwareCredentialKeyReplacement(credentialId)
  logWalletStep('hardware-ecdsa', 'hardware-credential-key-replacement-discarded', { credentialId })
  return true
}

export function readHardwareCredentialHolderDid(credentialId: string): string {
  return resolveHardwareCredentialHolderDid(credentialId)
}

export function resolveHardwareCredentialHolderDid(keyId: string): string {
  const bound = getEncryptedCredentialKeyRecord(keyId)
  if (bound) return bound.holderDid

  const pending = readPendingHardwareKeyMeta(keyId)
  if (pending) return pending.holderDid

  throw new Error('HardwareCredentialKeyNotFound')
}

export async function readHardwareCredentialSigningPublicJwk(keyId: string): Promise<EcP256Jwk> {
  const bound = getEncryptedCredentialKeyRecord(keyId)
  if (bound) {
    const signer = getHardwareEcdsaSigner()
    return signer.getPublicJwk(bound.alias)
  }

  const pending = readPendingHardwareKeyMeta(keyId)
  if (pending) return pending.publicJwk

  throw new Error('HardwareCredentialKeyNotFound')
}

export async function discardPendingHardwareCredentialKey(pendingId: string): Promise<void> {
  const meta = readPendingHardwareKeyMeta(pendingId)
  if (!meta) return

  const signer = getHardwareEcdsaSigner()
  try {
    if (await signer.hasKey(meta.alias)) {
      await signer.deleteKey(meta.alias)
    }
    removePendingHardwareKeyMeta(pendingId)
    logWalletStep('hardware-ecdsa', 'hardware-credential-pending-key-discarded', { pendingId })
  } catch (error) {
    logWalletError('hardware-ecdsa', 'hardware-credential-pending-key-discard-failed', error, { pendingId })
    enqueuePendingKeyGc({ pendingId, alias: meta.alias })
  }
}

export async function destroyHardwareCredentialKey(credentialId: string): Promise<void> {
  await destroyEncryptedCredentialKey(credentialId, getHardwareEcdsaSigner())
}

/** Resolves pending or bound hardware key public material for DID derivation. */
export async function readHardwareCredentialPublicKeyBytes(keyId: string): Promise<Uint8Array> {
  const jwk = await readHardwareCredentialSigningPublicJwk(keyId)
  return p256JwkToPublicKey(jwk)
}

export function readHardwareCredentialPublicJwkFromBytes(publicKey: Uint8Array): EcP256Jwk {
  return p256PublicKeyToJwk(publicKey)
}
