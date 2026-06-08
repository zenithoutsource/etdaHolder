import { Platform } from 'react-native'

import { normalizeWalletApiBaseUrl, getConfiguredWalletApiBaseUrl } from './installWalletApiFetch'
import { readWalletApiPinningConfig } from './walletApiCertPinning'

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
    throw new Error('WalletApiCertificatePinsRequired: non-development native builds require Wallet Backend certificate pins')
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
