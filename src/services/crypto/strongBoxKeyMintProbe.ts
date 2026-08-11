import { Platform } from 'react-native'

import { readHardwareSigningSessionTtlMs } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import { isWalletHardwareEcdsaNativeAvailable } from './walletHardwareEcdsaNative'

export type StrongBoxKeyMintProbeStep = {
  step: string
  [key: string]: unknown
}

export type StrongBoxKeyMintProbeResult = {
  featureStrongBoxKeystore: boolean
  strongBoxRequested: boolean
  strongBoxFallback: boolean
  strongBoxUnavailableExceptionClass?: string | null
  strongBoxUnavailableExceptionMessage?: string | null
  keyCreatePath?: string
  securityLevel?: string
  signVerifyOk?: boolean
  strongBoxPass?: boolean
  walletSpecStrongBoxRequested?: boolean
  walletSpecStrongBoxFallback?: boolean
  walletSpecStrongBoxUnavailableExceptionClass?: string | null
  walletSpecStrongBoxUnavailableExceptionMessage?: string | null
  walletSpecKeyCreatePath?: string
  walletSpecSecurityLevel?: string
  walletSpecStrongBoxPass?: boolean
  knoxVaultStrongBoxPathAvailable?: boolean
  knoxVaultWalletKeyPathAvailable?: boolean
  teeFallbackPass?: boolean
  teeDirectPass?: boolean
  overallPass: boolean
  probeAlias?: string
  walletProbeAlias?: string
  steps?: StrongBoxKeyMintProbeStep[]
  errorClass?: string
  errorMessage?: string
}

export type KnoxVaultProbeInterpretation = {
  samsungKnoxVaultListedDevice: 'unknown-on-device'
  androidStrongBoxFeature: boolean
  basicStrongBoxKeyMintWorks: boolean
  walletHolderKeyUsesStrongBox: boolean
  walletHolderKeySecurityLevel?: string
  summary: string
  recommendation: string
}

function loadProbeNativeModule(): {
  probeStrongBoxKeyMint: (options?: { authValiditySeconds?: number }) => Promise<StrongBoxKeyMintProbeResult>
} {
  const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core')
  return requireNativeModule('ExpoWalletHardwareEcdsa')
}

function readAuthValiditySeconds(): number {
  return Math.max(1, Math.floor(readHardwareSigningSessionTtlMs() / 1000))
}

export function interpretKnoxVaultStrongBoxProbe(
  result: StrongBoxKeyMintProbeResult,
): KnoxVaultProbeInterpretation {
  const androidStrongBoxFeature = result.featureStrongBoxKeystore
  const basicStrongBoxKeyMintWorks = Boolean(result.strongBoxPass)
  const walletHolderKeyUsesStrongBox = Boolean(result.knoxVaultWalletKeyPathAvailable)
  const walletLevel = result.walletSpecSecurityLevel ?? result.securityLevel

  let summary: string
  let recommendation: string

  if (walletHolderKeyUsesStrongBox) {
    summary =
      'StrongBox KeyMint path works with wallet holder key policy (user-auth P-256). On Samsung this is the Knox Vault StrongBox Keymaster path per Samsung docs.'
    recommendation = 'Holder keys should report securityLevel=STRONGBOX at createKey.'
  } else if (basicStrongBoxKeyMintWorks && result.walletSpecStrongBoxFallback) {
    summary =
      'Device exposes StrongBox for a simple probe key, but wallet holder key policy (PURPOSE_SIGN + user authentication) falls back to TEE. Knox Vault may still exist for platform secrets, but holder keys are not on the StrongBox/Knox Vault Keymaster path.'
    recommendation =
      'Review walletSpecStrongBoxUnavailableExceptionMessage in probe output. TEE is still hardware-backed; Knox Vault marketing does not guarantee STRONGBOX for every key policy.'
  } else if (androidStrongBoxFeature && result.strongBoxFallback) {
    summary =
      'Android reports FEATURE_STRONGBOX_KEYSTORE, but P-256 StrongBox keygen fell back (StrongBoxUnavailableException). Holder keys use TEE unless the OS accepts StrongBox.'
    recommendation =
      'Check strongBoxUnavailableExceptionMessage. Samsung Knox supported-devices list means Knox platform support, not that every app key becomes STRONGBOX.'
  } else if (!androidStrongBoxFeature) {
    summary =
      'Android does not advertise FEATURE_STRONGBOX_KEYSTORE on this build. Knox Vault may still be present for Samsung services, but the public StrongBox KeyStore API path is unavailable.'
    recommendation = 'Expect TEE for hardware-backed holder keys on this device.'
  } else {
    summary = 'Probe did not complete a StrongBox success path. See steps for keygen/sign details.'
    recommendation = 'Re-run after native rebuild; share full formatStrongBoxKeyMintReport output.'
  }

  return {
    samsungKnoxVaultListedDevice: 'unknown-on-device',
    androidStrongBoxFeature,
    basicStrongBoxKeyMintWorks,
    walletHolderKeyUsesStrongBox,
    walletHolderKeySecurityLevel: walletLevel,
    summary,
    recommendation,
  }
}

export async function runStrongBoxKeyMintProbe(): Promise<StrongBoxKeyMintProbeResult> {
  if (Platform.OS !== 'android') {
    return {
      featureStrongBoxKeystore: false,
      strongBoxRequested: false,
      strongBoxFallback: false,
      overallPass: false,
      errorMessage: 'StrongBoxKeyMintProbeAndroidOnly',
    }
  }

  if (!isWalletHardwareEcdsaNativeAvailable()) {
    return {
      featureStrongBoxKeystore: false,
      strongBoxRequested: false,
      strongBoxFallback: false,
      overallPass: false,
      errorMessage: 'WalletHardwareEcdsaNativeUnavailable',
    }
  }

  try {
    const native = loadProbeNativeModule()
    const result = await native.probeStrongBoxKeyMint({
      authValiditySeconds: readAuthValiditySeconds(),
    })
    const interpretation = interpretKnoxVaultStrongBoxProbe(result)

    logWalletStep('hardware-ecdsa', 'strongbox-keymint-probe-complete', {
      featureStrongBoxKeystore: result.featureStrongBoxKeystore,
      keyCreatePath: result.keyCreatePath,
      securityLevel: result.securityLevel,
      walletSpecKeyCreatePath: result.walletSpecKeyCreatePath,
      walletSpecSecurityLevel: result.walletSpecSecurityLevel,
      knoxVaultStrongBoxPathAvailable: result.knoxVaultStrongBoxPathAvailable,
      knoxVaultWalletKeyPathAvailable: result.knoxVaultWalletKeyPathAvailable,
      overallPass: result.overallPass,
      interpretation: interpretation.summary,
      ...(result.strongBoxUnavailableExceptionClass
        ? {
            strongBoxUnavailableExceptionClass: result.strongBoxUnavailableExceptionClass,
            strongBoxUnavailableExceptionMessage: result.strongBoxUnavailableExceptionMessage,
          }
        : {}),
      ...(result.walletSpecStrongBoxUnavailableExceptionClass
        ? {
            walletSpecStrongBoxUnavailableExceptionClass: result.walletSpecStrongBoxUnavailableExceptionClass,
            walletSpecStrongBoxUnavailableExceptionMessage: result.walletSpecStrongBoxUnavailableExceptionMessage,
          }
        : {}),
    })

    if (__DEV__) {
      console.info(formatStrongBoxKeyMintReport(result))
    }

    return result
  } catch (error) {
    logWalletError('hardware-ecdsa', 'strongbox-keymint-probe-failed', error)
    return {
      featureStrongBoxKeystore: false,
      strongBoxRequested: false,
      strongBoxFallback: false,
      overallPass: false,
      errorMessage: error instanceof Error ? error.message : 'StrongBoxKeyMintProbeFailed',
    }
  }
}

export function formatStrongBoxKeyMintReport(result: StrongBoxKeyMintProbeResult): string {
  const interpretation = interpretKnoxVaultStrongBoxProbe(result)
  const lines = [
    'StrongBox / Knox Vault probe',
    `  Knox interpretation: ${interpretation.summary}`,
    `  Recommendation: ${interpretation.recommendation}`,
    ...(result.strongBoxUnavailableExceptionClass
      ? [
          `  basic ${result.strongBoxUnavailableExceptionClass}: ${result.strongBoxUnavailableExceptionMessage ?? 'no-message'}`,
        ]
      : []),
    ...(result.walletSpecStrongBoxUnavailableExceptionClass
      ? [
          `  wallet ${result.walletSpecStrongBoxUnavailableExceptionClass}: ${result.walletSpecStrongBoxUnavailableExceptionMessage ?? 'no-message'}`,
        ]
      : []),
    `  FEATURE_STRONGBOX_KEYSTORE: ${result.featureStrongBoxKeystore ? 'yes' : 'no'}`,
    `  basic strongBoxRequested: ${result.strongBoxRequested ? 'yes' : 'no'}`,
    `  basic strongBoxFallback: ${result.strongBoxFallback ? 'yes' : 'no'}`,
    ...(result.keyCreatePath ? [`  basic keyCreatePath: ${result.keyCreatePath}`] : []),
    ...(result.securityLevel ? [`  basic securityLevel: ${result.securityLevel}`] : []),
    ...(result.signVerifyOk !== undefined ? [`  basic signVerifyOk: ${result.signVerifyOk ? 'yes' : 'no'}`] : []),
    ...(result.walletSpecKeyCreatePath
      ? [`  wallet keyCreatePath: ${result.walletSpecKeyCreatePath}`]
      : []),
    ...(result.walletSpecSecurityLevel
      ? [`  wallet securityLevel: ${result.walletSpecSecurityLevel}`]
      : []),
    `  knoxVaultStrongBoxPathAvailable: ${result.knoxVaultStrongBoxPathAvailable ? 'yes' : 'no'}`,
    `  knoxVaultWalletKeyPathAvailable: ${result.knoxVaultWalletKeyPathAvailable ? 'yes' : 'no'}`,
    `  overallPass: ${result.overallPass ? 'PASS' : 'FAIL'}`,
  ]

  if (result.steps?.length) {
    lines.push('  steps:')
    for (const step of result.steps) {
      lines.push(`    - ${JSON.stringify(step)}`)
    }
  }

  if (result.errorMessage) {
    lines.push(`  error: ${result.errorMessage}`)
  }

  return lines.join('\n')
}
