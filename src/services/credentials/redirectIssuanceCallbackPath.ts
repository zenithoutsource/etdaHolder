import {
  notifyPresentationIntakeRejectionForUri,
  readPresentationRequestUriFromIntake,
} from '../vp/presentationIntakeRejection'
import { isPresentationRequestConsumed } from '../vp/presentationRequestReplay'
import {
  isPresentationRequestDeeplink,
  isWithinDismissRedeliveryGrace,
  useDeeplinkStore,
} from '../../store/deeplinkStore'

const ISSUANCE_CALLBACK_HOSTS = new Set(['callback'])
const PRESENTATION_REQUEST_ROUTE = '/(tabs)/presentation-request'
const WALLET_TABS_ROUTE = '/(tabs)'

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
 * Returns `null` to ignore the navigation (Expo Router stays on the current route).
 */
export function redirectWalletSystemPath(
  path: string,
  options: { initial?: boolean } = {},
): string | null {
  const initial = options.initial === true

  try {
    const presentationUri = readPresentationRequestUriFromIntake(path)
    if (presentationUri && isPresentationRequestDeeplink(presentationUri)) {
      if (isPresentationRequestConsumed(presentationUri)) {
        notifyPresentationIntakeRejectionForUri(presentationUri)
        // Warm app: stay put (no Wallet remount). Cold start: land on tabs.
        return initial ? WALLET_TABS_ROUTE : null
      }
      // Dismissed redelivery within grace: silent stay-put.
      // After grace, clear dismiss so intentional same-link re-tap can open again.
      if (presentationUri === useDeeplinkStore.getState().dismissedUri) {
        if (isWithinDismissRedeliveryGrace(useDeeplinkStore.getState().dismissedAtMs)) {
          return initial ? WALLET_TABS_ROUTE : null
        }
        useDeeplinkStore.getState().clearDismissedDeeplinkUri()
      }
      // Skip /callback for VP so a repeat tap cannot bounce callback → Wallet.
      return PRESENTATION_REQUEST_ROUTE
    }

    const callbackPath = redirectIssuanceCallbackPath(path)
    if (callbackPath !== path) return callbackPath

    if (!path) return path
    const url = new URL(path)
    if (url.protocol === 'openid4vp:') return PRESENTATION_REQUEST_ROUTE
  } catch {
    if (path.startsWith('openid4vp://')) {
      if (isPresentationRequestConsumed(path)) {
        notifyPresentationIntakeRejectionForUri(path)
        return initial ? WALLET_TABS_ROUTE : null
      }
      if (path === useDeeplinkStore.getState().dismissedUri) {
        if (isWithinDismissRedeliveryGrace(useDeeplinkStore.getState().dismissedAtMs)) {
          return initial ? WALLET_TABS_ROUTE : null
        }
        useDeeplinkStore.getState().clearDismissedDeeplinkUri()
      }
      return PRESENTATION_REQUEST_ROUTE
    }
  }

  return path
}
