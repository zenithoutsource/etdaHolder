const DEFAULT_BROKER_BASE_URL = 'http://192.100.10.49'

export function resolveBrokerBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_BROKER_BASE_URL?.trim()
  const base = override && override.length > 0 ? override : DEFAULT_BROKER_BASE_URL
  return base.endsWith('/') ? base.slice(0, -1) : base
}
