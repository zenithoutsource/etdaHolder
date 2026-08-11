import { getMetaStorage } from '../storage/storage'

const REGISTRY_PREFIX = 'wallet.credential_keys.'

export type CredentialKeyRecord = {
  credentialId: string
  holderDid: string
  keychainService: string
  credentialType: string
  createdAt: string
}

function registryKey(credentialId: string): string {
  return `${REGISTRY_PREFIX}${credentialId}`
}

function parseCredentialKeyRecord(raw: string): CredentialKeyRecord | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<CredentialKeyRecord>
    if (
      typeof parsed.credentialId === 'string' &&
      typeof parsed.holderDid === 'string' &&
      typeof parsed.keychainService === 'string' &&
      typeof parsed.credentialType === 'string' &&
      typeof parsed.createdAt === 'string'
    ) {
      return parsed as CredentialKeyRecord
    }
  } catch {
    return undefined
  }

  return undefined
}

export function registerCredentialKey(record: CredentialKeyRecord): void {
  getMetaStorage().set(registryKey(record.credentialId), JSON.stringify(record))
}

export function getCredentialKeyRecord(credentialId: string): CredentialKeyRecord | undefined {
  const raw = getMetaStorage().getString(registryKey(credentialId))
  if (!raw) return undefined
  return parseCredentialKeyRecord(raw)
}

export function removeCredentialKeyRecord(credentialId: string): void {
  getMetaStorage().remove(registryKey(credentialId))
}

export function listCredentialKeyRecords(): CredentialKeyRecord[] {
  const storage = getMetaStorage()
  const keys = storage.getAllKeys?.() ?? []
  const records: CredentialKeyRecord[] = []

  for (const key of keys) {
    if (!key.startsWith(REGISTRY_PREFIX)) continue
    const raw = storage.getString(key)
    if (!raw) continue
    const record = parseCredentialKeyRecord(raw)
    if (record) records.push(record)
  }

  return records
}

/** Oldest credential Holder DID for push registration after cold-start key deferral. */
export function readFirstCredentialHolderDid(): string | undefined {
  const records = listCredentialKeyRecords()
  if (records.length === 0) return undefined
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return records[0]?.holderDid
}

/** Oldest per-credential key bind time — wallet key TTL anchor for v2 wallets. */
export function readEarliestCredentialKeyCreatedAt(): string | undefined {
  const records = listCredentialKeyRecords()
  if (records.length === 0) return undefined
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return records[0]?.createdAt
}
