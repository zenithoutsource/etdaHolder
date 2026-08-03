import { readMobileRuntimeEndpoint } from '../../config/runtimeEndpoints'
import { getConfiguredWalletApiBaseUrl } from '../../sdk/installWalletApiFetch'

const DEFAULT_BROKER_BASE_URL = 'https://wallet.zenithcomp.co.th:455'

export function resolveBrokerBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_BROKER_BASE_URL?.trim()
  const defaultUrl = __DEV__ ? DEFAULT_BROKER_BASE_URL : getConfiguredWalletApiBaseUrl()
  return readMobileRuntimeEndpoint(
    'BROKER_BASE_URL',
    override || defaultUrl,
    { requiredInRelease: true, allowHttpInDev: false },
  )
}
