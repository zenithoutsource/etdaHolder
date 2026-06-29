import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { notifyCredentialsChanged } from './storedCredentials'

const RENEWAL_KEY_PREFIX = 'credential:renewal:'

export type CredentialRenewalState =
  | 'renewal-required'
  | 'renewal-processing'
  | 'old-revoked'
  | 'renewed-active'
  | 'cleanup-pending'

export type CredentialRenewalRecord = {
  credentialId: string
  state: CredentialRenewalState
  previousHolderDid: string
  replacementCredentialId?: string
  revokedAt?: string
  renewedAt?: string
  updatedAt: string
}

export function readCredentialRenewal(
  credentialId: string,
): CredentialRenewalRecord | undefined {
  const raw = getCredentialStorage().getString(`${RENEWAL_KEY_PREFIX}${credentialId}`)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<CredentialRenewalRecord>
    if (
      parsed.credentialId === credentialId &&
      typeof parsed.previousHolderDid === 'string' &&
      typeof parsed.updatedAt === 'string' &&
      isCredentialRenewalState(parsed.state)
    ) {
      return parsed as CredentialRenewalRecord
    }
  } catch {
    return undefined
  }

  return undefined
}

export function writeCredentialRenewal(record: CredentialRenewalRecord): void {
  getCredentialStorage().set(
    `${RENEWAL_KEY_PREFIX}${record.credentialId}`,
    JSON.stringify(record),
  )
  notifyCredentialsChanged()
}

export function upsertCredentialRenewal(
  credentialId: string,
  updates: Omit<CredentialRenewalRecord, 'credentialId' | 'updatedAt'> & {
    updatedAt?: string
  },
  now = new Date(),
): CredentialRenewalRecord {
  const current = readCredentialRenewal(credentialId)
  const next: CredentialRenewalRecord = {
    ...current,
    credentialId,
    ...updates,
    updatedAt: updates.updatedAt ?? now.toISOString(),
  }
  writeCredentialRenewal(next)
  return next
}

export function clearCredentialRenewal(credentialId: string): void {
  const key = `${RENEWAL_KEY_PREFIX}${credentialId}`
  if (!getCredentialStorage().getString(key)) return

  getCredentialStorage().remove(key)
  notifyCredentialsChanged()
}

export function readCredentialRenewalStatuses(
  credentials: VerifiableCredentialRecord[],
): Record<string, CredentialRenewalRecord> {
  return Object.fromEntries(
    credentials
      .map((credential) => readCredentialRenewal(credential.id))
      .filter((record): record is CredentialRenewalRecord => Boolean(record))
      .map((record) => [record.credentialId, record]),
  )
}

export function isCredentialRenewalState(value: unknown): value is CredentialRenewalState {
  return (
    value === 'renewal-required' ||
    value === 'renewal-processing' ||
    value === 'old-revoked' ||
    value === 'renewed-active' ||
    value === 'cleanup-pending'
  )
}

export function blocksCredentialPresentation(
  renewal: CredentialRenewalRecord | undefined,
): boolean {
  if (!renewal) return false
  return renewal.state !== 'renewed-active'
}
