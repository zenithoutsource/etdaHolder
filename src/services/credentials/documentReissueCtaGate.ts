import type { WalletKeyExpiryLane } from '../crypto/walletKeyExpiryLane'
import type { CredentialRenewalState } from './credentialKeyRenewal'

const BLOCKING_RENEWAL_STATES = new Set<CredentialRenewalState>([
  'renewal-required',
  'renewal-processing',
  'cleanup-pending',
  'old-revoked',
])

/**
 * Document-expired "ขอเอกสารใหม่" → Scan must not compete with an in-flight P3
 * renewal Receive/cleanup path on the same credential.
 */
export function shouldOfferDocumentReissueCta(input: {
  lane: WalletKeyExpiryLane
  documentExpired: boolean
  renewalState?: CredentialRenewalState
}): boolean {
  if (!input.documentExpired || input.lane === 'create-key') return false
  if (input.renewalState && BLOCKING_RENEWAL_STATES.has(input.renewalState)) {
    return false
  }
  return true
}
