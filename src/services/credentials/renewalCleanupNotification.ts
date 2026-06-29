import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { getCredentialStorage } from '../storage/storage'
import {
  readCredentialRenewalStatuses,
  type CredentialRenewalRecord,
} from './credentialKeyRenewal'
import { readStoredCredentials } from './storedCredentials'

const DISMISSED_BANNER_KEY = 'renewal:cleanup-banner:dismissed'

export type RenewalCleanupPendingItem = {
  oldCredentialId: string
  replacementCredentialId?: string
}

export function isRenewalAwaitingHolderCleanup(
  renewal?: CredentialRenewalRecord,
): boolean {
  if (!renewal?.replacementCredentialId) return false

  return renewal.state === 'cleanup-pending' || renewal.state === 'old-revoked'
}


export function readRenewalsAwaitingCleanup(
  credentials: VerifiableCredentialRecord[] = readStoredCredentials(),
  renewalStatuses: Record<string, CredentialRenewalRecord> = readCredentialRenewalStatuses(
    credentials,
  ),
): RenewalCleanupPendingItem[] {
  return credentials
    .filter((credential) =>
      isRenewalAwaitingHolderCleanup(renewalStatuses[credential.id]),
    )
    .map((credential) => ({
      oldCredentialId: credential.id,
      replacementCredentialId: renewalStatuses[credential.id]?.replacementCredentialId,
    }))
}

export function readDismissedRenewalCleanupBannerIds(): string[] {
  const raw = getCredentialStorage().getString(DISMISSED_BANNER_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function dismissRenewalCleanupBanner(oldCredentialId: string): void {
  const ids = readDismissedRenewalCleanupBannerIds()
  if (ids.includes(oldCredentialId)) return

  getCredentialStorage().set(
    DISMISSED_BANNER_KEY,
    JSON.stringify([...ids, oldCredentialId]),
  )
}

export function clearRenewalCleanupBannerDismissal(oldCredentialId: string): void {
  const ids = readDismissedRenewalCleanupBannerIds().filter((id) => id !== oldCredentialId)
  getCredentialStorage().set(DISMISSED_BANNER_KEY, JSON.stringify(ids))
}

export function readVisibleRenewalCleanupBanners(
  credentials: VerifiableCredentialRecord[],
  renewalStatuses: Record<string, CredentialRenewalRecord>,
): RenewalCleanupPendingItem[] {
  const dismissed = new Set(readDismissedRenewalCleanupBannerIds())
  return readRenewalsAwaitingCleanup(credentials, renewalStatuses).filter(
    (item) => !dismissed.has(item.oldCredentialId),
  )
}

export function findCleanupPendingForCredentialType(
  credentialType: string,
  credentials: VerifiableCredentialRecord[] = readStoredCredentials(),
  renewalStatuses: Record<string, CredentialRenewalRecord> = readCredentialRenewalStatuses(
    credentials,
  ),
): RenewalCleanupPendingItem | undefined {
  const oldCredential = credentials.find((credential) => {
    if (credential.type !== credentialType) return false

    const renewal = renewalStatuses[credential.id]
    return isRenewalAwaitingHolderCleanup(renewal)
  })
  if (!oldCredential) return undefined

  return {
    oldCredentialId: oldCredential.id,
    replacementCredentialId: renewalStatuses[oldCredential.id]?.replacementCredentialId,
  }
}
