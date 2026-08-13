import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { isPerCredentialSigningEnabled } from '@/src/config/walletCryptoPolicy'
import {
  commitSoftwareCredentialKeyReplacement,
  destroyCredentialKey,
  discardPendingCredentialKey,
  discardSoftwareCredentialKeyReplacement,
} from './credentialSigningKey'
import {
  commitHardwareCredentialKeyReplacement,
  destroyHardwareCredentialKey,
  discardHardwareCredentialKeyReplacement,
  discardPendingHardwareCredentialKey,
  hasHardwareCredentialKey,
} from './hardwareCredentialSigningKey'

/** True when issuance/presentation uses per-credential keys (`k_cred` or hardware P-256). */
export function usesPerCredentialSigning(): boolean {
  return isHardwareP256SigningEnabled() || isPerCredentialSigningEnabled()
}

export async function discardPendingIssuanceCredentialKey(pendingId: string): Promise<void> {
  if (isHardwareP256SigningEnabled()) {
    await discardPendingHardwareCredentialKey(pendingId)
    return
  }
  await discardPendingCredentialKey(pendingId)
}

export async function destroyIssuanceCredentialKey(credentialId: string): Promise<void> {
  if (await discardHardwareCredentialKeyReplacement(credentialId)) return
  if (await discardSoftwareCredentialKeyReplacement(credentialId)) return
  if (hasHardwareCredentialKey(credentialId)) {
    await destroyHardwareCredentialKey(credentialId)
    return
  }
  await destroyCredentialKey(credentialId)
}

export async function commitIssuanceCredentialKeyReplacement(credentialId: string): Promise<void> {
  await commitHardwareCredentialKeyReplacement(credentialId)
  await commitSoftwareCredentialKeyReplacement(credentialId)
}

export async function discardIssuanceCredentialArtifacts(input: {
  credentialId?: string
  pendingCredentialKeyId?: string
}): Promise<void> {
  if (input.credentialId) {
    await destroyIssuanceCredentialKey(input.credentialId)
  }
  if (input.pendingCredentialKeyId) {
    await discardPendingIssuanceCredentialKey(input.pendingCredentialKeyId)
  }
}
