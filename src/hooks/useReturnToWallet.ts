import { type Router } from 'expo-router'
import { useCallback } from 'react'

type WalletRouter = Pick<Router, 'dismissTo' | 'replace' | 'navigate'>

/**
 * Returns to the Wallet home tab after a transient flow (VP / credential offer).
 *
 * Use Expo Router path navigation only. Typed hrefs are `/(tabs)` or `/`
 * (not `/(tabs)/index` — that path is unmatched and shows Unmatched Route).
 * Never use CommonActions.reset with a partial tab route list.
 */
export function useReturnToWallet(router: WalletRouter): () => void {
  return useCallback(() => {
    try {
      router.replace('/(tabs)')
    } catch {
      try {
        router.navigate('/(tabs)')
      } catch {
        try {
          router.replace('/')
        } catch {
          router.dismissTo('/(tabs)')
        }
      }
    }
  }, [router])
}
