import { create } from 'zustand'
import type { PlatformOSType } from 'react-native'

type DeeplinkState = {
  pendingUri: string | null
  activeUri: string | null
  dismissedUri: string | null
  offerGeneration: number
  vpGeneration: number
}

type DeeplinkActions = {
  setPendingDeeplinkUri: (uri: string) => void
  setIncomingDeeplinkUri: (uri: string) => void
  activateDeeplinkUri: (uri: string) => void
  setDismissedDeeplinkUri: (uri: string) => void
  consumePendingDeeplinkUri: () => string | null
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

export const useDeeplinkStore = create<DeeplinkState & DeeplinkActions>((set, get) => ({
  pendingUri: null,
  activeUri: null,
  dismissedUri: null,
  offerGeneration: 0,
  vpGeneration: 0,

  setPendingDeeplinkUri: (uri) => set((state) => storeDeeplinkUri(state, uri)),

  setIncomingDeeplinkUri: (uri) => set((state) => storeDeeplinkUri(state, uri)),

  activateDeeplinkUri: (uri) => set((state) => {
    if (state.activeUri === uri && state.pendingUri !== uri) return state

    return {
      activeUri: uri,
      pendingUri: state.pendingUri === uri ? null : state.pendingUri,
    }
  }),

  setDismissedDeeplinkUri: (uri) => set((state) => ({
    dismissedUri: uri,
    pendingUri: state.pendingUri === uri ? null : state.pendingUri,
    activeUri: state.activeUri === uri ? null : state.activeUri,
  })),

  consumePendingDeeplinkUri: () => {
    const uri = get().pendingUri
    if (uri) get().activateDeeplinkUri(uri)
    return uri
  },
}))
