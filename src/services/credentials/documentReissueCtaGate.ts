import type { WalletKeyExpiryLane } from '../crypto/walletKeyExpiryLane'
import type { CredentialRenewalState } from './credentialKeyRenewal'

const BLOCKING_RENEWAL_STATES = new Set<CredentialRenewalState>([
  'renewal-processing',
  'cleanup-pending',
  'old-revoked',
])

/**
 * Document-expired "ขอเอกสารใหม่" → issuer portal must not compete with an in-flight P3
 * renewal Receive/cleanup path on the same credential.
 */
export function shouldOfferDocumentReissueCta(input: {
  lane: WalletKeyExpiryLane
  documentExpired: boolean
  renewalState?: CredentialRenewalState
}): boolean {
  if (!input.documentExpired) return false
  if (input.renewalState && BLOCKING_RENEWAL_STATES.has(input.renewalState)) {
    return false
  }
  return true
}

export function shouldShowWalletKeyExpiredPrompt(
  lane: WalletKeyExpiryLane,
  usesWalletWideKeyRotation = true,
): boolean {
  if (!usesWalletWideKeyRotation) return false
  return lane === 'create-key'
}
