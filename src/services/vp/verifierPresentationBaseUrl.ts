import { resolveVpRelayBaseUrl } from './vpRelayBaseUrl'

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/** Verifier-owned presentation service base URL (KB-JWT aud + verify QR host). */
export function resolveVerifierPresentationBaseUrl(): string {
  const verifierOverride = process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL?.trim()
  if (verifierOverride) {
    return normalizeBaseUrl(verifierOverride)
  }

  const gatewayOverride = process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL?.trim()
  if (gatewayOverride) {
    return normalizeBaseUrl(gatewayOverride)
  }

  const relayOverride = process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL?.trim()
  if (relayOverride) {
    return normalizeBaseUrl(relayOverride)
  }

  return resolveVpRelayBaseUrl()
}
