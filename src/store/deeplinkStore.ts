import { create } from 'zustand'
import type { PlatformOSType } from 'react-native'

type DeeplinkState = {
  pendingUri: string | null
  dismissedUri: string | null
  offerGeneration: number
  vpGeneration: number
}

type DeeplinkActions = {
  setPendingDeeplinkUri: (uri: string) => void
  setIncomingDeeplinkUri: (uri: string) => void
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
}): '/(tabs)/scan' | undefined {
  if (!input.pendingUri || !isPresentationRequestDeeplink(input.pendingUri)) return undefined
  if (input.pendingUri === input.dismissedUri) return undefined
  if (!input.isAuthenticated) return undefined
  if (input.platform !== 'web' && !input.hasWalletPin) return undefined
  return '/(tabs)/scan'
}

export const useDeeplinkStore = create<DeeplinkState & DeeplinkActions>((set, get) => ({
  pendingUri: null,
  dismissedUri: null,
  offerGeneration: 0,
  vpGeneration: 0,

  setPendingDeeplinkUri: (uri) => set((state) => ({
    pendingUri: uri,
    dismissedUri: state.dismissedUri === uri ? null : state.dismissedUri,
    offerGeneration: isCredentialOfferDeeplink(uri) ? state.offerGeneration + 1 : state.offerGeneration,
    vpGeneration: isPresentationRequestDeeplink(uri) ? state.vpGeneration + 1 : state.vpGeneration,
  })),

  setIncomingDeeplinkUri: (uri) => set((state) => ({
    pendingUri: uri,
    dismissedUri: state.dismissedUri === uri ? null : state.dismissedUri,
    offerGeneration: isCredentialOfferDeeplink(uri) ? state.offerGeneration + 1 : state.offerGeneration,
    vpGeneration: isPresentationRequestDeeplink(uri) ? state.vpGeneration + 1 : state.vpGeneration,
  })),

  setDismissedDeeplinkUri: (uri) => set((state) => ({
    dismissedUri: uri,
    pendingUri: state.pendingUri === uri ? null : state.pendingUri,
  })),

  consumePendingDeeplinkUri: () => {
    const uri = get().pendingUri
    if (uri) set({ pendingUri: null })
    return uri
  },
}))
