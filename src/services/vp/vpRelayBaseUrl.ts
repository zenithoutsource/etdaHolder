export function resolveVpRelayBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL?.trim()
  if (override) {
    return override.endsWith('/') ? override.slice(0, -1) : override
  }

  const walletApiBase = (process.env.EXPO_PUBLIC_WALLET_API_BASE_URL ?? 'http://localhost:3001')
    .trim()
    .replace(/\/$/, '')
  if (walletApiBase.endsWith('/wallet-api')) {
    return walletApiBase.slice(0, -'/wallet-api'.length)
  }

  return walletApiBase
}
