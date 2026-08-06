import type { CredentialInactiveState } from './credentialInactiveState'
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
  return kind === 'renewal-processing' || kind === 'document-expired'
}

export function shouldShowInactivePortalRequestCta(
  inactiveState: CredentialInactiveState,
): boolean {
  const kind = inactiveState.kind as InactiveCredentialKind | 'active'
  return kind === 'issuer-suspended' || kind === 'revoked' || kind === 'deleted'
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
