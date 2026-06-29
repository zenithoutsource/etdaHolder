import { readWalletKeyRotationRecord } from '../crypto/walletKeyRotation'
import type { CredentialRenewalRecord } from './credentialKeyRenewal'
import { findCleanupPendingForCredentialType } from './renewalCleanupNotification'

/**
 * Green Active ribbon/badge only while the holder still owes cleanup on the old VC.
 * After old credential deletion the new VC is a normal document again.
 */
export function shouldShowRenewedActiveBadge(
  credentialType: string,
  renewalStatus?: CredentialRenewalRecord,
): boolean {
  if (renewalStatus?.state !== 'renewed-active') return false

  return findCleanupPendingForCredentialType(credentialType) !== undefined
}

/** Hide revoke/delete while wallet key rotation renewal flow is in progress. */
export function shouldHideCredentialActionMenu(
  renewalStatus?: CredentialRenewalRecord,
): boolean {
  if (readWalletKeyRotationRecord()) return true
  if (renewalStatus) return true

  return false
}
