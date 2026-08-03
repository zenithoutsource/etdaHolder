import { Platform } from 'react-native'

import { logWalletStep } from '../services/debug/walletLogger'
import { normalizeWalletApiBaseUrl, getConfiguredWalletApiBaseUrl } from './installWalletApiFetch'
import { isLegacyCertificateResourcePin, isPublicKeyPin, readWalletApiPinningConfig } from './walletApiCertPinning'

type PlatformOS = typeof Platform.OS

type WalletApiRuntimePolicyOptions = {
  baseUrl: string
  isDevelopment: boolean
  pinnedCertificates: string[]
  platformOS: PlatformOS
}

function isHttpsUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).protocol === 'https:'
  } catch {
    return false
  }
}

export function assertWalletApiRuntimePolicy(options: WalletApiRuntimePolicyOptions): void {
  if (options.isDevelopment || options.platformOS === 'web') return

  const baseUrl = normalizeWalletApiBaseUrl(options.baseUrl)
  if (!isHttpsUrl(baseUrl)) {
    throw new Error('WalletApiTransportSecurityRequired: non-development native builds require HTTPS Wallet Backend URL')
  }

  if (options.pinnedCertificates.length === 0) {
    logWalletStep('sdk', 'wallet-api-runtime-policy-blocked', {
      reason: 'missing-pins',
      pinCount: 0,
    })
    throw new Error('WalletApiCertificatePinsRequired: non-development native builds require Wallet Backend certificate pins')
  }

  if (options.pinnedCertificates.some(isLegacyCertificateResourcePin)) {
    logWalletStep('sdk', 'wallet-api-runtime-policy-blocked', {
      reason: 'legacy-cert-resource-pins',
      pinCount: options.pinnedCertificates.length,
    })
    throw new Error(
      'WalletApiLegacyCertificatePinsRejected: replace file cert resource names with sha256/ public-key pins',
    )
  }

  if (!options.pinnedCertificates.every(isPublicKeyPin)) {
    logWalletStep('sdk', 'wallet-api-runtime-policy-blocked', {
      reason: 'invalid-public-key-pin-format',
      pinCount: options.pinnedCertificates.length,
    })
    throw new Error(
      'WalletApiPublicKeyPinsRequired: non-development native builds require sha256/ public-key pins for the Wallet Backend',
    )
  }
}

export function assertConfiguredWalletApiRuntimePolicy(): void {
  const baseUrl = normalizeWalletApiBaseUrl(getConfiguredWalletApiBaseUrl())
  const pinningConfig = readWalletApiPinningConfig(baseUrl)

  assertWalletApiRuntimePolicy({
    baseUrl: pinningConfig.backendBaseUrl,
    isDevelopment: __DEV__,
    pinnedCertificates: pinningConfig.pinnedCertificates,
    platformOS: Platform.OS,
  })
}
