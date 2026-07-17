import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { readCredentialRenewal } from './credentialKeyRenewal'
import { isRenewalAwaitingHolderCleanup } from './renewalCleanupNotification'
import { readStoredCredentials } from './storedCredentials'

export function readFirstPendingRenewalCredentialId(
  credentials: VerifiableCredentialRecord[] = readStoredCredentials(),
): string | undefined {
  for (const credential of credentials) {
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state === 'renewal-required') {
      return credential.id
    }
  }

  for (const credential of credentials) {
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state === 'renewal-processing') {
      return credential.id
    }
  }

  for (const credential of credentials) {
    const renewal = readCredentialRenewal(credential.id)
    if (isRenewalAwaitingHolderCleanup(renewal)) {
      return credential.id
    }
  }

  return undefined
}
