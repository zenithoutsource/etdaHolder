import { recordCredentialLifecycleAction } from './credentialLifecycle'
import { findExpiredCredentialsOfSameType } from './credentialDocumentExpiry'
import { removeStoredCredential } from './storedCredentials'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function readExpiredCredentialsForCleanupAfterClaim(
  newRecord: VerifiableCredentialRecord,
  credentials: VerifiableCredentialRecord[],
  now = new Date(),
): VerifiableCredentialRecord[] {
  return findExpiredCredentialsOfSameType(newRecord, credentials, now)
}

export function deleteExpiredCredentialAfterReissue(credentialId: string): void {
  recordCredentialLifecycleAction(credentialId, 'Delete', 'system')
  removeStoredCredential(credentialId)
}
