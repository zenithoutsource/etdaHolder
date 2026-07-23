import type { PlatformOSType } from 'react-native'

import {
  readPendingCredentialOfferRoute,
  readPendingPresentationRoute,
} from '../../store/deeplinkStore'

type PostLoginRouteInput = {
  platform: PlatformOSType
  hasWalletPin: boolean
}

type StartupRouteInput = {
  isAuthenticated: boolean
  isPinVerified: boolean
  currentSegment?: string
  platform: PlatformOSType
  hasWalletPin: boolean
  isResumePinCheckPending?: boolean
}

type WalletAccessRedirectInput = StartupRouteInput & {
  pendingUri?: string | null
  dismissedUri?: string | null
}

export type WalletRoute = '/(tabs)' | '/auth' | '/pin-setup' | '/pin-lock'

export const PIN_UNLOCK_FLOW_SEGMENTS = new Set(['pin-lock', 'forgot-pin'])

export function readPostLoginRoute(input: PostLoginRouteInput): WalletRoute {
  if (input.platform !== 'web' && !input.hasWalletPin) return '/pin-setup'
  return '/(tabs)'
}

const UNAUTHENTICATED_PUBLIC_SEGMENTS = new Set(['auth', 'login', 'register', 'forgot-pin'])
const AUTHENTICATED_AUTH_FLOW_SEGMENTS = new Set(['auth', 'login', 'pin-setup', 'forgot-pin', 'pin-lock', 'callback'])

function requiresPinUnlock(input: StartupRouteInput): boolean {
  return input.platform !== 'web' && input.hasWalletPin && !input.isPinVerified
}

export function readStartupRoute(input: StartupRouteInput): WalletRoute | undefined {
  const segment = input.currentSegment ?? ''
  if (!input.isAuthenticated && UNAUTHENTICATED_PUBLIC_SEGMENTS.has(segment)) {
    return undefined
  }

  if (input.isAuthenticated && segment === 'pin-lock' && input.isPinVerified) {
    return '/(tabs)'
  }

  if (input.isAuthenticated && segment === '(tabs)' && requiresPinUnlock(input)) {
    return '/pin-lock'
  }

  if (input.isAuthenticated && AUTHENTICATED_AUTH_FLOW_SEGMENTS.has(segment)) {
    return undefined
  }

  if (!input.isAuthenticated) return '/auth'
  if (input.platform !== 'web' && !input.hasWalletPin) return '/pin-setup'
  if (requiresPinUnlock(input)) return '/pin-lock'
  return '/(tabs)'
}

export function segmentToWalletRoute(segment: string | undefined): WalletRoute | undefined {
  if (!segment) return undefined
  if (segment === '(tabs)') return '/(tabs)'
  if (segment === 'auth') return '/auth'
  if (segment === 'pin-setup') return '/pin-setup'
  if (segment === 'pin-lock') return '/pin-lock'
  return undefined
}

function hasPendingPostUnlockDeeplinkRoute(input: WalletAccessRedirectInput): boolean {
  if (!input.pendingUri) return false

  const routeInput = {
    pendingUri: input.pendingUri,
    dismissedUri: input.dismissedUri ?? null,
    isAuthenticated: input.isAuthenticated,
    platform: input.platform,
    hasWalletPin: input.hasWalletPin,
  }

  return Boolean(
    readPendingCredentialOfferRoute(routeInput)
      || readPendingPresentationRoute(routeInput),
  )
}

export function readWalletAccessRedirect(input: WalletAccessRedirectInput): WalletRoute | undefined {
  const targetRoute = readStartupRoute(input)
  if (!targetRoute) return undefined

  if (targetRoute === '/pin-lock' && input.isResumePinCheckPending) {
    return undefined
  }

  const currentRoute = segmentToWalletRoute(input.currentSegment)
  if (currentRoute === targetRoute) return undefined

  if (targetRoute === '/pin-lock' && input.currentSegment === 'forgot-pin') {
    return undefined
  }

  // pin-lock.tsx routes to credential-offer/scan after unlock; avoid racing Redirect to tabs.
  if (
    targetRoute === '/(tabs)'
    && input.currentSegment === 'pin-lock'
    && input.isPinVerified
    && hasPendingPostUnlockDeeplinkRoute(input)
  ) {
    return undefined
  }

  return targetRoute
}

export function readResumeRoute(): undefined {
  return undefined
}
