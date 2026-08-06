import { useFocusEffect } from 'expo-router'
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture'
import { useCallback } from 'react'

import { logWalletError } from '../services/debug/walletLogger'

function isScreenCaptureGuardEnabled(): boolean {
  return process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD !== 'true'
}

export function useScreenCaptureGuard(): void {
  useFocusEffect(
    useCallback(() => {
      if (!isScreenCaptureGuardEnabled()) {
        return undefined
      }

      let active = true

      void preventScreenCaptureAsync().catch((error) => {
        logWalletError('screen-capture', 'prevent-failed', error)
      })

      return () => {
        if (!active) return
        active = false
        void allowScreenCaptureAsync().catch((error) => {
          logWalletError('screen-capture', 'allow-failed', error)
        })
      }
    }, []),
  )
}
