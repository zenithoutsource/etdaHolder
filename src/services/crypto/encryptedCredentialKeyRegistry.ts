import { getCredentialStorage } from '../storage/storage'
import type { HardwareEcdsaSigner } from './hardwareEcdsaTypes'
import { HardwareKeyNotFoundError } from './hardwareEcdsaTypes'
import type { HardwareSecurityLevel } from './hardwareEcdsaTypes'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

const REGISTRY_PREFIX = 'wallet.p256.credential_keys.'

export type EncryptedCredentialKeyRecord = {
  credentialId: string
  holderDid: string
  alias: string
  credentialType: string
  createdAt: string
  securityLevelHint: HardwareSecurityLevel
}

function registryKey(credentialId: string): string {
  return `${REGISTRY_PREFIX}${credentialId}`
}

function parseEncryptedCredentialKeyRecord(raw: string): EncryptedCredentialKeyRecord | undefined {
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

export function registerEncryptedCredentialKey(record: EncryptedCredentialKeyRecord): void {
  getCredentialStorage().set(registryKey(record.credentialId), JSON.stringify(record))
}

export function getEncryptedCredentialKeyRecord(credentialId: string): EncryptedCredentialKeyRecord | undefined {
  const raw = getCredentialStorage().getString(registryKey(credentialId))
  if (!raw) return undefined
  return parseEncryptedCredentialKeyRecord(raw)
}

export function removeEncryptedCredentialKeyRecord(credentialId: string): void {
  getCredentialStorage().remove(registryKey(credentialId))
}

export function listEncryptedCredentialKeyRecords(): EncryptedCredentialKeyRecord[] {
  const storage = getCredentialStorage()
  const keys = storage.getAllKeys?.() ?? []
  const records: EncryptedCredentialKeyRecord[] = []

  for (const key of keys) {
    if (!key.startsWith(REGISTRY_PREFIX)) continue
    const raw = storage.getString(key)
    if (!raw) continue
    const record = parseEncryptedCredentialKeyRecord(raw)
    if (record) records.push(record)
  }

  return records
}

export function readFirstEncryptedCredentialHolderDid(): string | undefined {
  const records = listEncryptedCredentialKeyRecords()
  if (records.length === 0) return undefined
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return records[0]?.holderDid
}

/** Oldest hardware k_cred bind time — wallet key TTL anchor when Ed25519 is deferred. */
export function readEarliestEncryptedCredentialKeyCreatedAt(): string | undefined {
  try {
    const records = listEncryptedCredentialKeyRecords()
    if (records.length === 0) return undefined
    records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return records[0]?.createdAt
  } catch (error) {
    if (error instanceof Error && error.message === 'StorageNotInitialized') return undefined
    throw error
  }
}

export function findEncryptedCredentialKeyByType(
  credentialType: string,
): EncryptedCredentialKeyRecord | undefined {
  return listEncryptedCredentialKeyRecords().find((record) => record.credentialType === credentialType)
}

/**
 * Bind = write encrypted registry row only; Keystore alias stays unchanged.
 */
export function bindPendingCredentialAlias(input: {
  credentialId: string
  alias: string
  holderDid: string
  credentialType: string
  securityLevelHint: HardwareSecurityLevel
  createdAt?: string
}): EncryptedCredentialKeyRecord {
  const record: EncryptedCredentialKeyRecord = {
    credentialId: input.credentialId,
    holderDid: input.holderDid,
    alias: input.alias,
    credentialType: input.credentialType,
    createdAt: input.createdAt ?? new Date().toISOString(),
    securityLevelHint: input.securityLevelHint,
  }
  registerEncryptedCredentialKey(record)
  return record
}

/**
 * Destroy ordering: deleteKey → hasKey === false → remove encrypted registry row.
 * Retry-safe when the Keystore alias is already gone (native deleteKey throws KeyNotFound).
 */
export async function destroyEncryptedCredentialKey(
  credentialId: string,
  signer: HardwareEcdsaSigner,
): Promise<void> {
  const record = getEncryptedCredentialKeyRecord(credentialId)
  if (!record) return

  const { alias } = record
  logWalletStep('hardware-ecdsa', 'destroy-credential-key-start', { credentialId })

  try {
    if (await signer.hasKey(alias)) {
      await signer.deleteKey(alias)
    }
  } catch (error) {
    if (await signer.hasKey(alias)) {
      logWalletError('hardware-ecdsa', 'destroy-credential-key-delete-failed', error, { credentialId, alias })
      throw error
    }
    logWalletStep('hardware-ecdsa', 'destroy-credential-key-already-gone', { credentialId, alias })
  }

  if (await signer.hasKey(alias)) {
    const error = new HardwareKeyNotFoundError(alias)
    logWalletError('hardware-ecdsa', 'destroy-credential-key-still-present', error, { credentialId, alias })
    throw new Error(`DestroyCredentialKeyFailed: alias still present after deleteKey (${alias})`)
  }

  try {
    removeEncryptedCredentialKeyRecord(credentialId)
  } catch (error) {
    logWalletError('hardware-ecdsa', 'destroy-credential-key-registry-remove-failed', error, { credentialId })
    throw error
  }

  logWalletStep('hardware-ecdsa', 'destroy-credential-key-complete', { credentialId })
}

/** Retry registry cleanup when Keystore delete already succeeded. */
export function retryEncryptedCredentialKeyRegistryCleanup(credentialId: string): void {
  removeEncryptedCredentialKeyRecord(credentialId)
}
