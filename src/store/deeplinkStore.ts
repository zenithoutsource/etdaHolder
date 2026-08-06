import { create } from 'zustand'
import type { PlatformOSType } from 'react-native'

import type { PresentationFlowOrigin } from '../services/vp/oid4vc/types'

type DeeplinkState = {
  pendingUri: string | null
  pendingPresentationFlowOrigin: PresentationFlowOrigin | null
  activeUri: string | null
  dismissedUri: string | null
  offerGeneration: number
  vpGeneration: number
  presentationIntakeError: string | null
}

type DeeplinkActions = {
  setPendingDeeplinkUri: (uri: string) => void
  setPendingPresentationRequest: (input: { uri: string; origin: PresentationFlowOrigin }) => void
  setIncomingDeeplinkUri: (uri: string) => void
  activateDeeplinkUri: (uri: string) => void
  setDismissedDeeplinkUri: (uri: string) => void
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
  if (
    (state.pendingUri === uri || state.activeUri === uri)
    && state.dismissedUri !== uri
  ) {
    return state
  }

  return {
    ...state,
    pendingUri: uri,
    dismissedUri: state.dismissedUri === uri ? null : state.dismissedUri,
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

export const useDeeplinkStore = create<DeeplinkState & DeeplinkActions>((set, get) => ({
  pendingUri: null,
  pendingPresentationFlowOrigin: null,
  activeUri: null,
  dismissedUri: null,
  offerGeneration: 0,
  vpGeneration: 0,
  presentationIntakeError: null,

  setPendingDeeplinkUri: (uri) => set((state) => storeDeeplinkUri(state, uri)),

  setPendingPresentationRequest: ({ uri, origin }) => set((state) => ({
    ...storeDeeplinkUri(state, uri),
    pendingPresentationFlowOrigin: isPresentationRequestDeeplink(uri) ? origin : state.pendingPresentationFlowOrigin,
  })),

  setIncomingDeeplinkUri: (uri) => set((state) => storeDeeplinkUri(state, uri)),

  activateDeeplinkUri: (uri) => set((state) => {
    if (state.activeUri === uri && state.pendingUri !== uri) return state

    return {
      activeUri: uri,
      pendingUri: state.pendingUri === uri ? null : state.pendingUri,
      pendingPresentationFlowOrigin: state.pendingUri === uri
        ? clearPendingPresentationFlowOrigin(state, uri)
        : state.pendingPresentationFlowOrigin,
    }
  }),

  setDismissedDeeplinkUri: (uri) => set((state) => ({
    dismissedUri: uri,
    pendingUri: state.pendingUri === uri ? null : state.pendingUri,
    activeUri: state.activeUri === uri ? null : state.activeUri,
    pendingPresentationFlowOrigin: state.pendingUri === uri || state.activeUri === uri
      ? clearPendingPresentationFlowOrigin(state, uri)
      : state.pendingPresentationFlowOrigin,
  })),

  consumePendingDeeplinkUri: () => {
    const uri = get().pendingUri
    if (uri) get().activateDeeplinkUri(uri)
    return uri
  },

  setPresentationIntakeError: (message) => set({ presentationIntakeError: message }),

  clearPresentationIntakeError: () => set({ presentationIntakeError: null }),
}))
