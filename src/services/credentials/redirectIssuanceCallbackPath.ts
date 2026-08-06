const ISSUANCE_CALLBACK_HOSTS = new Set(['callback'])
const PRESENTATION_REQUEST_ROUTE = '/(tabs)/presentation-request'

/**
 * Map Issuer portal return URLs (walletapp://callback?credential_offer_uri=...)
 * to the /callback Expo Router path.
 */
export function redirectIssuanceCallbackPath(path: string): string {
  try {
    if (!path) return path

    const url = new URL(path, 'walletapp://app')
    const scheme = url.protocol.replace(':', '')
    if (
      (scheme === 'walletapp' || scheme === 'etdawallet')
      && ISSUANCE_CALLBACK_HOSTS.has(url.hostname)
    ) {
      return `/callback${url.search}`
    }

    if (path.startsWith('walletapp://callback') || path.startsWith('etdawallet://callback')) {
      const queryIndex = path.indexOf('?')
      return queryIndex >= 0 ? `/callback${path.slice(queryIndex)}` : '/callback'
    }
  } catch {
    return path
  }

  return path
}

/**
 * Map wallet system deeplinks to Expo Router paths (+native-intent).
 */
export function redirectWalletSystemPath(path: string): string {
  const callbackPath = redirectIssuanceCallbackPath(path)
  if (callbackPath !== path) return callbackPath

  try {
    if (!path) return path
    const url = new URL(path)
    if (url.protocol === 'openid4vp:') return PRESENTATION_REQUEST_ROUTE
  } catch {
    if (path.startsWith('openid4vp://')) return PRESENTATION_REQUEST_ROUTE
  }

  return path
}
