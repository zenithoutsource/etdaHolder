import type { PlatformOSType } from 'react-native'

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

export type WalletRoute = '/(tabs)' | '/auth' | '/pin-setup' | '/pin-lock'

export const PIN_UNLOCK_FLOW_SEGMENTS = new Set(['pin-lock', 'forgot-pin'])

export function readPostLoginRoute(input: PostLoginRouteInput): WalletRoute {
  if (input.platform !== 'web' && !input.hasWalletPin) return '/pin-setup'
  return '/(tabs)'
}

const UNAUTHENTICATED_PUBLIC_SEGMENTS = new Set(['auth', 'login', 'register', 'forgot-pin'])
const AUTHENTICATED_AUTH_FLOW_SEGMENTS = new Set(['auth', 'login', 'pin-setup', 'forgot-pin', 'pin-lock'])

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

export function readWalletAccessRedirect(input: StartupRouteInput): WalletRoute | undefined {
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

  return targetRoute
}

export function readResumeRoute(): undefined {
  return undefined
}
