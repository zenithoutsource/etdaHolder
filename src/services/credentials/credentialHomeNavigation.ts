import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import type { CredentialInactiveState } from './credentialInactiveState'
import { isStoredCredentialKeyTtlExpired } from './credentialKeyExpiry'
import type { CredentialRenewalRecord } from './credentialKeyRenewal'

type InactiveCredentialKind = Extract<
  CredentialInactiveState,
  { kind: Exclude<CredentialInactiveState['kind'], 'active'> }
>['kind']

export function shouldNavigateInactiveCredentialToDetail(
  inactiveState: CredentialInactiveState,
  options?: {
    hasPendingSuspensionAck?: boolean
    renewalStatus?: Pick<CredentialRenewalRecord, 'state' | 'readyOfferUri'>
  },
): boolean {
  const kind = inactiveState.kind as InactiveCredentialKind | 'active'
  if (kind === 'issuer-suspended') {
    // Pending acknowledgment must go to detail so the Holder can acknowledge
    // (and delete). Once acknowledged, the home expanded panel takes over with
    // the portal request CTA.
    return options?.hasPendingSuspensionAck !== false
  }
  if (kind === 'renewal-processing' && shouldShowReadyRenewalReceiveCta(true, options?.renewalStatus)) {
    return false
  }
  return (
    kind === 'renewal-processing' ||
    kind === 'document-expired' ||
    kind === 'hardware-reissue-required'
  )
}

export function shouldSplitSuspendedHomeRow(
  inactiveState: CredentialInactiveState,
): boolean {
  return (
    inactiveState.kind === 'issuer-suspended' ||
    inactiveState.kind === 'revoked' ||
    inactiveState.kind === 'document-expired' ||
    inactiveState.kind === 'hardware-reissue-required' ||
    inactiveState.kind === 'renewal-required' ||
    inactiveState.kind === 'renewal-processing' ||
    inactiveState.kind === 'cleanup-pending' ||
    inactiveState.kind === 'old-revoked'
  )
}

export function shouldBlockCredentialDetailPresentment(
  inactiveState: CredentialInactiveState,
  credential?: Pick<VerifiableCredentialRecord, 'id' | 'expiresAt' | 'claims' | 'type'>,
  now?: Date,
): boolean {
  const kind = inactiveState.kind as InactiveCredentialKind | 'active'
  if (
    kind === 'renewal-required' ||
    kind === 'renewal-processing' ||
    kind === 'old-revoked' ||
    kind === 'cleanup-pending' ||
    kind === 'document-expired' ||
    kind === 'hardware-reissue-required' ||
    kind === 'issuer-suspended' ||
    kind === 'revoked'
  ) {
    return true
  }

  return credential ? isStoredCredentialKeyTtlExpired(credential, now) : false
}

export function shouldShowInactivePortalRequestCta(
  inactiveState: CredentialInactiveState,
): boolean {
  const kind = inactiveState.kind as InactiveCredentialKind | 'active'
  return (
    kind === 'issuer-suspended' ||
    kind === 'revoked' ||
    kind === 'deleted' ||
    kind === 'hardware-reissue-required' ||
    kind === 'document-expired'
  )
}

export function shouldShowReadyRenewalReceiveCta(
  isExpanded: boolean,
  renewalStatus?: Pick<CredentialRenewalRecord, 'state' | 'readyOfferUri'>,
): boolean {
  return (
    isExpanded &&
    renewalStatus?.state === 'renewal-processing' &&
    Boolean(renewalStatus.readyOfferUri?.trim())
  )
}
