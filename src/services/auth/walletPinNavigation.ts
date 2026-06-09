import type { PlatformOSType } from 'react-native'

type PostLoginRouteInput = {
  platform: PlatformOSType
  hasWalletPin: boolean
}

type StartupRouteInput = {
  isAuthenticated: boolean
  currentSegment?: string
}

export type WalletRoute = '/(tabs)' | '/login' | '/pin-setup'

export function readPostLoginRoute(input: PostLoginRouteInput): WalletRoute {
  if (input.platform !== 'web' && !input.hasWalletPin) return '/pin-setup'
  return '/(tabs)'
}

export function readStartupRoute(input: StartupRouteInput): WalletRoute | undefined {
  if (input.isAuthenticated && (input.currentSegment === 'login' || input.currentSegment === 'pin-setup')) {
    return undefined
  }
  return input.isAuthenticated ? '/(tabs)' : '/login'
}

export function readResumeRoute(): undefined {
  return undefined
}
