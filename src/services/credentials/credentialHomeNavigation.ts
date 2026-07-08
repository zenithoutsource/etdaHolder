import type { CredentialInactiveState } from './credentialInactiveState'

type InactiveCredentialKind = Extract<
  CredentialInactiveState,
  { kind: Exclude<CredentialInactiveState['kind'], 'active'> }
>['kind']

export function shouldNavigateInactiveCredentialToDetail(
  inactiveState: CredentialInactiveState,
  options?: { hasPendingSuspensionAck?: boolean },
): boolean {
  const kind = inactiveState.kind as InactiveCredentialKind | 'active'
  if (kind === 'issuer-suspended') {
    // Pending acknowledgment must go to detail so the Holder can acknowledge
    // (and delete). Once acknowledged, the home expanded panel takes over with
    // the portal request CTA.
    return options?.hasPendingSuspensionAck !== false
  }
  return kind === 'renewal-processing' || kind === 'document-expired'
}

export function shouldShowInactivePortalRequestCta(
  inactiveState: CredentialInactiveState,
): boolean {
  const kind = inactiveState.kind as InactiveCredentialKind | 'active'
  return kind === 'issuer-suspended' || kind === 'revoked' || kind === 'deleted'
}
