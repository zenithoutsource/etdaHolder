/**
 * Post-claim finalize: P3 pairing and calendar-expired same-family sibling removal.
 */

import { areCredentialsSameReissueFamily } from './credentialReissueFamily'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import { deleteExpiredCredentialAfterReissue } from './documentExpiryCleanup'
import { pairRenewalReplacementForSavedCredential } from './renewalIssuerIntake'
import { readStoredCredentials } from './storedCredentials'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function finalizeCredentialClaim(record: VerifiableCredentialRecord): void {
  try {
    pairRenewalReplacementForSavedCredential(record)
  } catch (error) {
    logWalletError('credentials', 'finalize-claim-pair-failed', error, {
      credentialId: record.id,
    })
  }

  const credentials = readStoredCredentials()
  for (const candidate of credentials) {
    if (candidate.id === record.id) continue
    if (!areCredentialsSameReissueFamily(candidate, record)) continue
    if (!isCredentialDocumentExpired(candidate)) continue
    logWalletStep('credentials', 'finalize-claim-remove-expired-sibling', {
      newCredentialId: record.id,
      expiredCredentialId: candidate.id,
    })
    deleteExpiredCredentialAfterReissue(candidate.id)
  }
}
