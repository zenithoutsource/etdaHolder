import { logWalletError, logWalletStep } from '../debug/walletLogger'
import {
  createMemoryIssuanceProofSession,
  type ProofSigningSession,
} from './crypto'
import { discardPendingCredentialKey } from './credentialSigningKey'
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
 * Opens a short-lived issuance session: pending seed stays in memory for PoP,
 * v2 activates with attest reuse when needed, and bind performs the single
 * biometric Keychain write of the lasting credential seed.
 */
export async function withIssuanceKeySession<T>(
  run: (session: IssuanceKeySession) => Promise<T>,
): Promise<T> {
  const proofSession = createMemoryIssuanceProofSession()
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
        if (isWalletCryptoV2Enabled()) {
          logWalletStep('crypto', 'issuance-key-session-v2-already-enabled')
          return
        }
        await activateWalletCryptoV2()
        logWalletStep('crypto', 'issuance-key-session-v2-activated')
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
      await discardPendingCredentialKey(pendingCredentialKeyId)
    }
  }
}
