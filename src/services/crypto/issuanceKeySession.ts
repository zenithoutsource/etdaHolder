import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import {
  createHardwareMemoryIssuanceProofSession,
  createMemoryIssuanceProofSession,
  type ProofSigningSession,
} from './crypto'
import { discardPendingCredentialKey } from './credentialSigningKey'
import { discardPendingHardwareCredentialKey } from './hardwareCredentialSigningKey'
import {
  activateWalletCryptoV2,
  isWalletCryptoV2Enabled,
} from './walletCryptoActivation'

export type IssuanceKeySession = {
  pendingCredentialKeyId: string
  proofSession: ProofSigningSession
  activateV2IfNeeded: () => Promise<void>
}

/**
 * Opens a short-lived issuance session: pending `k_cred` stays in memory for PoP,
 * hardware `k_attest` activation runs when needed, and bind performs the single
 * biometric write of the lasting credential key.
 */
export async function withIssuanceKeySession<T>(
  run: (session: IssuanceKeySession) => Promise<T>,
): Promise<T> {
  const proofSession = isHardwareP256SigningEnabled()
    ? await createHardwareMemoryIssuanceProofSession()
    : createMemoryIssuanceProofSession()
  const pendingCredentialKeyId = proofSession.credentialKeyId
  if (!pendingCredentialKeyId) {
    proofSession.close()
    throw new Error('IssuanceKeySessionMissingPendingId')
  }

  let runSucceeded = false
  try {
    logWalletStep('crypto', 'issuance-key-session-start', { pendingCredentialKeyId })
    const session: IssuanceKeySession = {
      pendingCredentialKeyId,
      proofSession,
      activateV2IfNeeded: async () => {
        await activateWalletCryptoV2()
        logWalletStep('crypto', 'issuance-key-session-v2-activated', {
          v2Enabled: isWalletCryptoV2Enabled(),
        })
      },
    }

    const result = await run(session)
    runSucceeded = true
    return result
  } catch (error) {
    logWalletError('crypto', 'issuance-key-session-failed', error, { pendingCredentialKeyId })
    throw error
  } finally {
    proofSession.close()
    if (!runSucceeded) {
      if (isHardwareP256SigningEnabled()) {
        await discardPendingHardwareCredentialKey(pendingCredentialKeyId)
      } else {
        await discardPendingCredentialKey(pendingCredentialKeyId)
      }
    }
  }
}
