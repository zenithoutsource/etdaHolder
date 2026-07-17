function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function resolveWalletApiOriginFallback(): string {
  const walletApiBase = (process.env.EXPO_PUBLIC_WALLET_API_BASE_URL ?? 'http://localhost:3001')
    .trim()
    .replace(/\/$/, '')
  if (walletApiBase.endsWith('/wallet-api')) {
    return walletApiBase.slice(0, -'/wallet-api'.length)
  }
  return walletApiBase
}

/** Verifier-owned presentation service base URL (legacy Option A My QR path). */
export function resolveVerifierPresentationBaseUrl(): string {
  const verifierOverride = process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL?.trim()
  if (verifierOverride) {
    return normalizeBaseUrl(verifierOverride)
  }

  const gatewayOverride = process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL?.trim()
  if (gatewayOverride) {
    return normalizeBaseUrl(gatewayOverride)
  }

  return resolveWalletApiOriginFallback()
}
