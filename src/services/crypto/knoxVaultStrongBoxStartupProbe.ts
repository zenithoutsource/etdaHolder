import { Platform } from 'react-native'

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { logWalletStep } from '@/src/services/debug/walletLogger'

import { runStrongBoxKeyMintProbe } from './strongBoxKeyMintProbe'

let startupProbeStarted = false

function shouldRunKnoxVaultStartupProbe(): boolean {
  if (!__DEV__ || Platform.OS !== 'android') return false
  if (!isHardwareP256SigningEnabled()) return false
  if (process.env.EXPO_PUBLIC_RUN_STRONGBOX_PROBE_ON_STARTUP === 'false') return false
  return true
}

/**
 * Dev-only: verify Android StrongBox / Samsung Knox Vault Keymaster path once per app session.
 * Requires a dev build with expo-wallet-hardware-ecdsa (Metro reload is not enough after native changes).
 */
export function maybeRunKnoxVaultStrongBoxStartupProbe(): void {
  if (!shouldRunKnoxVaultStartupProbe() || startupProbeStarted) return
  startupProbeStarted = true

  logWalletStep('hardware-ecdsa', 'knox-vault-startup-probe-scheduled', {
    hardwareP256SigningEnabled: true,
  })

  void runStrongBoxKeyMintProbe().catch(() => undefined)
}

export function __resetKnoxVaultStrongBoxStartupProbeForTests(): void {
  startupProbeStarted = false
}
