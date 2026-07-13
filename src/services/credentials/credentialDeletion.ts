import { recordCredentialLifecycleAction } from './credentialLifecycle'
import { removeStoredCredential } from './storedCredentials'

export function deleteStoredCredentialAfterHolderApproval(credentialId: string): void {
  recordCredentialLifecycleAction(credentialId, 'Delete', 'holder')
  removeStoredCredential(credentialId)
}
