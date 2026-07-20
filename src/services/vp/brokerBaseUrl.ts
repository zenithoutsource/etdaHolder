import { readMobileRuntimeEndpoint } from '../../config/runtimeEndpoints'

const DEFAULT_BROKER_BASE_URL = 'https://wallet.zenithcomp.co.th:455'

export function resolveBrokerBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_BROKER_BASE_URL?.trim()
  return readMobileRuntimeEndpoint(
    'BROKER_BASE_URL',
    override || (__DEV__ ? DEFAULT_BROKER_BASE_URL : undefined),
    { requiredInRelease: true, allowHttpInDev: false },
  )
}
