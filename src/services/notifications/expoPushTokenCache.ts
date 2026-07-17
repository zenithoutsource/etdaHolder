import { logWalletError } from '@/src/services/debug/walletLogger'

let cachedExpoPushToken: string | null = null

export function setCachedExpoPushToken(token: string): void {
  cachedExpoPushToken = token
}

export function getCachedExpoPushToken(): string | null {
  return cachedExpoPushToken
}

export function clearCachedExpoPushToken(): void {
  cachedExpoPushToken = null
}

async function fetchExpoPushTokenValueDefault(): Promise<string> {
  // Lazy import avoids a module cycle with pushNotificationService (which caches tokens here).
  const { fetchExpoPushTokenValue } = await import('./pushNotificationService')
  return fetchExpoPushTokenValue()
}

/**
 * Resolves the Expo push token to send as `deviceToken` on broker session create.
 * Returns the cached token when present, otherwise fetches it once via the same
 * projectId/fetch helper the push notification service uses. Never throws: on
 * failure it logs a diagnostic (no token value) and resolves to `''`, since the
 * broker accepts a nullable deviceToken.
 */
export async function resolveDeviceTokenForBroker(
  fetchToken: () => Promise<string> = fetchExpoPushTokenValueDefault,
): Promise<string> {
  const cached = getCachedExpoPushToken()
  if (cached) {
    return cached
  }

  try {
    const token = await fetchToken()
    setCachedExpoPushToken(token)
    return token
  } catch (error) {
    logWalletError('vp-broker', 'device-token-resolve-failed', error)
    return ''
  }
}
