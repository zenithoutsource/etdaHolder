import { readWalletKeyRotationRecord } from '../crypto/walletKeyRotation'
import type {
  CredentialRenewalRecord,
  CredentialRenewalState,
} from './credentialKeyRenewal'
import type { CredentialInactiveState } from './credentialInactiveState'
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

/** Matches `CredentialRenewalOverlay` ribbon visibility on credential detail. */
export function shouldShowCredentialRenewalRibbon(
  inactiveState: CredentialInactiveState,
  renewalState?: CredentialRenewalState,
): boolean {
  if (inactiveState.kind === 'active') {
    return renewalState === 'renewed-active'
  }

  return (
    inactiveState.kind === 'renewal-required' ||
    inactiveState.kind === 'renewal-processing' ||
    inactiveState.kind === 'old-revoked' ||
    inactiveState.kind === 'cleanup-pending' ||
    inactiveState.kind === 'document-expired'
  )
}

type CredentialActionMenuContext = {
  inactiveState: CredentialInactiveState
  renewalState?: CredentialRenewalState
}

/** Hide revoke/delete while renewal ribbon is shown or rotation flow is in progress. */
export function shouldHideCredentialActionMenu(
  renewalStatus?: CredentialRenewalRecord,
  context?: CredentialActionMenuContext,
): boolean {
  if (readWalletKeyRotationRecord()) return true
  if (
    context &&
    shouldShowCredentialRenewalRibbon(context.inactiveState, context.renewalState)
  ) {
    return true
  }
  if (renewalStatus) return true

  return false
}
