import { Platform } from 'react-native'

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'

import {
  formatSliceBChecklistReport,
  runHardwareEcdsaSliceBChecklist,
  type SliceBChecklistResult,
} from './hardwareEcdsaChecklistRunner'
import {
  formatStrongBoxKeyMintReport,
  interpretKnoxVaultStrongBoxProbe,
  runStrongBoxKeyMintProbe,
  type StrongBoxKeyMintProbeResult,
} from './strongBoxKeyMintProbe'

export type HardwareEcdsaProbeResult = {
  backend: string
  nativeProbeAvailable: boolean
  platform: string
  steps: string[]
  knoxVaultProbe?: StrongBoxKeyMintProbeResult
  knoxVaultInterpretation?: ReturnType<typeof interpretKnoxVaultStrongBoxProbe>
  error?: string
}

/**
 * Quick row-1-only probe (legacy entry point).
 * Prefer `runHardwareEcdsaSliceBChecklist()` for the full Slice B table.
 */
export async function runHardwareEcdsaDevProbes(): Promise<HardwareEcdsaProbeResult> {
  const knoxVaultProbe =
    Platform.OS === 'android' && isHardwareP256SigningEnabled()
      ? await runStrongBoxKeyMintProbe()
      : undefined
  const knoxVaultInterpretation = knoxVaultProbe
    ? interpretKnoxVaultStrongBoxProbe(knoxVaultProbe)
    : undefined

  const checklist = await runHardwareEcdsaSliceBChecklist({
    skipCapacityStress: true,
  })

  const row1 = checklist.rows.find((row) => row.id === '1')
  const steps = [
    ...(knoxVaultInterpretation ? [`knox-vault:${knoxVaultInterpretation.summary}`] : []),
    ...(knoxVaultProbe?.walletSpecSecurityLevel
      ? [`wallet-spec-securityLevel=${knoxVaultProbe.walletSpecSecurityLevel}`]
      : []),
    ...(row1?.evidence ?? []),
  ]

  if (checklist.backend === 'blocked') {
    return {
      backend: 'blocked',
      nativeProbeAvailable: false,
      platform: Platform.OS,
      steps,
      knoxVaultProbe,
      knoxVaultInterpretation,
      error: 'HardwareEcdsaProbesDevOnly',
    }
  }

  return {
    backend: checklist.backend,
    nativeProbeAvailable: checklist.nativeProbeAvailable,
    platform: checklist.platform,
    steps,
    knoxVaultProbe,
    knoxVaultInterpretation,
    error: row1?.status === 'fail' ? row1.error : undefined,
  }
}

export {
  formatSliceBChecklistReport,
  formatStrongBoxKeyMintReport,
  interpretKnoxVaultStrongBoxProbe,
  runHardwareEcdsaSliceBChecklist,
  runStrongBoxKeyMintProbe,
  type SliceBChecklistResult,
  type StrongBoxKeyMintProbeResult,
}
