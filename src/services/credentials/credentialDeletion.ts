import {
  readHistoryDocumentLabel,
  readHistoryIssuerPartyName,
} from '../../config/historyDisplayNames'
import { destroyIssuanceCredentialKey } from '../crypto/perCredentialSigning'
import { logWalletError } from '../debug/walletLogger'
import { clearSuccessfulPresentationBadge } from '../history/presentationHistory'
import { appendWalletHistoryEvent } from '../history/walletEventLog'
import { deleteStoredMdoc } from '../proximity/mdocStorage'
import { getCredentialStorage } from '../storage/storage'
import { clearNewCredentialBadge } from './credentialBadges'
import { clearCredentialRenewal } from './credentialKeyRenewal'
import {
  clearCredentialLifecycleStatus,
  type CredentialLifecycleInitiator,
} from './credentialLifecycle'
import { readCredentialIssuerName } from './credentialIssuer'
import {
  findLogicalCredentialsByRawCredentialRef,
  removeLogicalCredential,
} from './logicalCredentialStorage'
import { clearRenewalCleanupBannerDismissal } from './renewalCleanupNotification'
import { readStoredCredentialById, removeStoredCredential } from './storedCredentials'

const SUSPENSION_KEY_PREFIX = 'credential:suspension:'

function appendCredentialDeletedHistory(
  credentialId: string,
  initiatedBy: CredentialLifecycleInitiator,
  now = new Date(),
): void {
  const record = readStoredCredentialById(credentialId)
  if (!record) return

  appendWalletHistoryEvent({
    kind: 'credential-deleted',
    credentialId,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: readHistoryIssuerPartyName({
      credentialType: record.type,
      protocolIssuerName: readCredentialIssuerName(record),
    }),
    channel: 'wallet',
    credentialType: record.type,
    initiatedBy,
    occurredAt: now.toISOString(),
  })
}

/** Removes every local wallet record for a credential without leaving a soft-delete marker. */
export function purgeCredentialStorageKeys(credentialId: string): void {
  const storage = getCredentialStorage()

  for (const logical of findLogicalCredentialsByRawCredentialRef(credentialId, storage)) {
    removeLogicalCredential(logical.logicalCredentialId, storage)
  }

  clearCredentialLifecycleStatus(credentialId)
  clearCredentialRenewal(credentialId)
  clearRenewalCleanupBannerDismissal(credentialId)
  if (storage.getString(`${SUSPENSION_KEY_PREFIX}${credentialId}`)) {
    storage.remove(`${SUSPENSION_KEY_PREFIX}${credentialId}`)
  }
  clearNewCredentialBadge(credentialId)
  clearSuccessfulPresentationBadge(credentialId)
  removeStoredCredential(credentialId)
}

export function purgeCredentialFromWallet(
  credentialId: string,
  initiatedBy: CredentialLifecycleInitiator = 'holder',
): void {
  appendCredentialDeletedHistory(credentialId, initiatedBy)
  purgeCredentialStorageKeys(credentialId)

  void destroyIssuanceCredentialKey(credentialId).catch((error) => {
    logWalletError('credential-deletion', 'destroy-credential-key-failed', error, { credentialId })
  })
  void deleteStoredMdoc(credentialId).catch((error) => {
    logWalletError('credential-deletion', 'delete-mdoc-failed', error, { credentialId })
  })
}

export function deleteStoredCredentialAfterHolderApproval(credentialId: string): void {
  purgeCredentialFromWallet(credentialId, 'holder')
}
