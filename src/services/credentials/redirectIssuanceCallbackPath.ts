const ISSUANCE_CALLBACK_HOSTS = new Set(['callback'])

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
