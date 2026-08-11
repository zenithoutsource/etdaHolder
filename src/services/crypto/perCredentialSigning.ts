import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'

import { isWalletCryptoV2Enabled } from './walletCryptoActivation'

/** True when issuance/presentation uses per-credential keys (Ed25519 v2 or hardware P-256). */
export function usesPerCredentialSigning(): boolean {
  return isWalletCryptoV2Enabled() || isHardwareP256SigningEnabled()
}
