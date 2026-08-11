import { create } from 'zustand'
import type { PlatformOSType } from 'react-native'

import type { PresentationFlowOrigin } from '../services/vp/oid4vc/types'

export type OfferFlowOrigin = 'scan' | 'same-device'

type DeeplinkState = {
  pendingUri: string | null
  pendingPresentationFlowOrigin: PresentationFlowOrigin | null
  pendingOfferFlowOrigin: OfferFlowOrigin | null
  activeUri: string | null
  activePresentationFlowOrigin: PresentationFlowOrigin | null
  activeOfferFlowOrigin: OfferFlowOrigin | null
  dismissedUri: string | null
  /** Wall-clock ms when dismissedUri was set; used for redelivery grace. */
  dismissedAtMs: number | null
  offerGeneration: number
  vpGeneration: number
  /** Bumped on dismiss so abandoned pending URIs can be routed again safely. */
  routeEpoch: number
  presentationIntakeError: string | null
}

type DeeplinkActions = {
  setPendingDeeplinkUri: (uri: string) => void
  setPendingPresentationRequest: (input: { uri: string; origin: PresentationFlowOrigin }) => void
  setPendingCredentialOffer: (input: { uri: string; origin: OfferFlowOrigin }) => void
  setIncomingDeeplinkUri: (uri: string) => void
  activateDeeplinkUri: (uri: string) => void
  setDismissedDeeplinkUri: (uri: string) => void
  /** Explicit user action (e.g. Scan same QR) before re-queueing a dismissed URI. */
  clearDismissedDeeplinkUri: () => void
  consumePendingDeeplinkUri: () => string | null
  setPresentationIntakeError: (message: string) => void
  clearPresentationIntakeError: () => void
}

export function isSupportedWalletDeeplink(uri: string): boolean {
  if (isCredentialOfferDeeplink(uri)) return true

  try {
    const parsed = new URL(uri)
    if (parsed.protocol === 'openid4vp:') return true
    return parsed.searchParams.get('response_type') === 'vp_token'
  } catch {
    return false
  }
}

export function isCredentialOfferDeeplink(uri: string): boolean {
  return uri.startsWith('openid-credential-offer://')
}

export function isPresentationRequestDeeplink(uri: string): boolean {
  if (!uri || isCredentialOfferDeeplink(uri)) return false
  return isSupportedWalletDeeplink(uri)
}

/** True when this URI must not be re-queued (user left the flow or replay blocked). */
export function isDeeplinkUriBlocked(uri: string, dismissedUri: string | null): boolean {
  return Boolean(uri) && uri === dismissedUri
}

/**
 * Ignore Android intent redelivery for this long after Back.
 * After the grace window, the same URI may be queued again (intentional re-tap).
 * Unit: ms. Default: 1500.
 */
export const DEEPLINK_DISMISS_REDELIVERY_GRACE_MS =
  Number(process.env.EXPO_PUBLIC_DEEPLINK_DISMISS_REDELIVERY_GRACE_MS) || 1_500

export function isWithinDismissRedeliveryGrace(
  dismissedAtMs: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (dismissedAtMs == null) return false
  return nowMs - dismissedAtMs < DEEPLINK_DISMISS_REDELIVERY_GRACE_MS
}

/**
 * Queue a deeplink only when it is not currently dismissed.
 * Intent redelivery within the grace window must not reopen the flow.
 * After the grace window, clears dismiss and queues (same-link re-tap).
 */
export function tryQueueDeeplinkUri(
  uri: string,
  options?: { origin?: PresentationFlowOrigin | OfferFlowOrigin },
): boolean {
  const state = useDeeplinkStore.getState()
  if (isDeeplinkUriBlocked(uri, state.dismissedUri)) {
    if (isWithinDismissRedeliveryGrace(state.dismissedAtMs)) {
      return false
    }
    state.clearDismissedDeeplinkUri()
  }

  if (isPresentationRequestDeeplink(uri)) {
    const origin = (options?.origin === 'scan' || options?.origin === 'my-qr' || options?.origin === 'same-device')
      ? options.origin
      : 'same-device'
    state.setPendingPresentationRequest({ uri, origin })
    return true
  }

  if (isCredentialOfferDeeplink(uri)) {
    const origin = options?.origin === 'scan' ? 'scan' : 'same-device'
    state.setPendingCredentialOffer({ uri, origin })
    return true
  }

  state.setPendingDeeplinkUri(uri)
  return true
}

export function readPendingCredentialOfferRoute(input: {
  pendingUri: string | null
  dismissedUri?: string | null
  isAuthenticated: boolean
  platform: PlatformOSType
  hasWalletPin: boolean
}): '/(tabs)/credential-offer' | undefined {
  if (!input.pendingUri || !isCredentialOfferDeeplink(input.pendingUri)) return undefined
  if (input.pendingUri === input.dismissedUri) return undefined
  if (!input.isAuthenticated) return undefined
  if (input.platform !== 'web' && !input.hasWalletPin) return undefined
  return '/(tabs)/credential-offer'
}

export function readPendingPresentationRoute(input: {
  pendingUri: string | null
  dismissedUri?: string | null
  isAuthenticated: boolean
  platform: PlatformOSType
  hasWalletPin: boolean
}): '/(tabs)/presentation-request' | undefined {
  if (!input.pendingUri || !isPresentationRequestDeeplink(input.pendingUri)) return undefined
  if (input.pendingUri === input.dismissedUri) return undefined
  if (!input.isAuthenticated) return undefined
  if (input.platform !== 'web' && !input.hasWalletPin) return undefined
  return '/(tabs)/presentation-request'
}

function storeDeeplinkUri(
  state: DeeplinkState & DeeplinkActions,
  uri: string,
): DeeplinkState & DeeplinkActions {
  // Dismissed URIs stay dismissed through the redelivery grace window.
  // After grace, tryQueue clears dismiss before calling setters; Scan clears explicitly.
  if (state.dismissedUri === uri) {
    return state
  }

  if (state.pendingUri === uri || state.activeUri === uri) {
    return state
  }

  // A newer deeplink supersedes any in-flight active URI so screens hydrate the
  // fresh pending request instead of replaying a failed/stale active flow.
  const replacingActive = state.activeUri != null && state.activeUri !== uri

  return {
    ...state,
    pendingUri: uri,
    activeUri: replacingActive ? null : state.activeUri,
    activePresentationFlowOrigin: replacingActive ? null : state.activePresentationFlowOrigin,
    activeOfferFlowOrigin: replacingActive ? null : state.activeOfferFlowOrigin,
    offerGeneration: isCredentialOfferDeeplink(uri) ? state.offerGeneration + 1 : state.offerGeneration,
    vpGeneration: isPresentationRequestDeeplink(uri) ? state.vpGeneration + 1 : state.vpGeneration,
  }
}

function clearPendingPresentationFlowOrigin(
  state: DeeplinkState & DeeplinkActions,
  uri: string,
): PresentationFlowOrigin | null {
  return isPresentationRequestDeeplink(uri) ? null : state.pendingPresentationFlowOrigin
}

function clearPendingOfferFlowOrigin(
  state: DeeplinkState & DeeplinkActions,
  uri: string,
): OfferFlowOrigin | null {
  return isCredentialOfferDeeplink(uri) ? null : state.pendingOfferFlowOrigin
}

export const useDeeplinkStore = create<DeeplinkState & DeeplinkActions>((set, get) => ({
  pendingUri: null,
  pendingPresentationFlowOrigin: null,
  pendingOfferFlowOrigin: null,
  activeUri: null,
  activePresentationFlowOrigin: null,
  activeOfferFlowOrigin: null,
  dismissedUri: null,
  dismissedAtMs: null,
  offerGeneration: 0,
  vpGeneration: 0,
  routeEpoch: 0,
  presentationIntakeError: null,

  setPendingDeeplinkUri: (uri) => set((state) => storeDeeplinkUri(state, uri)),

  setPendingPresentationRequest: ({ uri, origin }) => set((state) => ({
    ...storeDeeplinkUri(state, uri),
    pendingPresentationFlowOrigin: isPresentationRequestDeeplink(uri) ? origin : state.pendingPresentationFlowOrigin,
  })),

  setPendingCredentialOffer: ({ uri, origin }) => set((state) => ({
    ...storeDeeplinkUri(state, uri),
    pendingOfferFlowOrigin: isCredentialOfferDeeplink(uri) ? origin : state.pendingOfferFlowOrigin,
  })),

  setIncomingDeeplinkUri: (uri) => set((state) => ({
    ...storeDeeplinkUri(state, uri),
    pendingOfferFlowOrigin: isCredentialOfferDeeplink(uri)
      ? 'same-device'
      : state.pendingOfferFlowOrigin,
  })),

  activateDeeplinkUri: (uri) => set((state) => {
    if (state.activeUri === uri && state.pendingUri !== uri) return state

    const consumingPendingVp = state.pendingUri === uri && isPresentationRequestDeeplink(uri)
    const consumingPendingOffer = state.pendingUri === uri && isCredentialOfferDeeplink(uri)

    return {
      activeUri: uri,
      pendingUri: state.pendingUri === uri ? null : state.pendingUri,
      pendingPresentationFlowOrigin: consumingPendingVp
        ? null
        : state.pendingPresentationFlowOrigin,
      activePresentationFlowOrigin: consumingPendingVp
        ? state.pendingPresentationFlowOrigin
        : state.activePresentationFlowOrigin,
      pendingOfferFlowOrigin: consumingPendingOffer
        ? null
        : state.pendingOfferFlowOrigin,
      activeOfferFlowOrigin: consumingPendingOffer
        ? state.pendingOfferFlowOrigin
        : state.activeOfferFlowOrigin,
    }
  }),

  setDismissedDeeplinkUri: (uri) => set((state) => ({
    dismissedUri: uri,
    dismissedAtMs: Date.now(),
    routeEpoch: state.routeEpoch + 1,
    pendingUri: state.pendingUri === uri ? null : state.pendingUri,
    activeUri: state.activeUri === uri ? null : state.activeUri,
    pendingPresentationFlowOrigin: state.pendingUri === uri || state.activeUri === uri
      ? clearPendingPresentationFlowOrigin(state, uri)
      : state.pendingPresentationFlowOrigin,
    activePresentationFlowOrigin: state.pendingUri === uri || state.activeUri === uri
      ? null
      : state.activePresentationFlowOrigin,
    pendingOfferFlowOrigin: state.pendingUri === uri || state.activeUri === uri
      ? clearPendingOfferFlowOrigin(state, uri)
      : state.pendingOfferFlowOrigin,
    activeOfferFlowOrigin: state.pendingUri === uri || state.activeUri === uri
      ? null
      : state.activeOfferFlowOrigin,
  })),

  clearDismissedDeeplinkUri: () => set({ dismissedUri: null, dismissedAtMs: null }),

  consumePendingDeeplinkUri: () => {
    const uri = get().pendingUri
    if (uri) get().activateDeeplinkUri(uri)
    return uri
  },

  setPresentationIntakeError: (message) => set({ presentationIntakeError: message }),

  clearPresentationIntakeError: () => set({ presentationIntakeError: null }),
}))
