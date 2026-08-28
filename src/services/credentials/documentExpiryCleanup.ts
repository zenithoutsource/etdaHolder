import { purgeCredentialFromWallet } from './credentialDeletion'
import { findExpiredCredentialsOfSameType } from './credentialDocumentExpiry'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function readExpiredCredentialsForCleanupAfterClaim(
  newRecord: VerifiableCredentialRecord,
  credentials: VerifiableCredentialRecord[],
  now = new Date(),
): VerifiableCredentialRecord[] {
  return findExpiredCredentialsOfSameType(newRecord, credentials, now)
}

export function deleteExpiredCredentialAfterReissue(credentialId: string): void {
  purgeCredentialFromWallet(credentialId, 'system')
}
