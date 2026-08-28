/**
 * Starts the Android DC API provider bridge and keeps registry metadata in sync.
 */
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'

import { readStoredCredentials, subscribeCredentialsChange } from '@/src/services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import {
  pullAndHandlePendingDcApiRequests,
  startDcApiProviderBridge,
  syncDcApiRegistryFromCredentials,
} from '@/src/services/vp/dcApi/dcApiConsentBridge'

export async function runDcApiRegistrySync(reason: string): Promise<void> {
  if (Platform.OS !== 'android') return

  try {
    const result = await syncDcApiRegistryFromCredentials(readStoredCredentials())
    logWalletStep('dc-api-provider', 'registry-sync-run-complete', { reason, ...result })
  } catch (error) {
    logWalletError('dc-api-provider', 'registry-sync-run-failed', error, { reason })
  }
}

export function useDcApiProviderBridge(startupReady: boolean): void {
  const router = useRouter()

  useEffect(() => {
    if (!startupReady || Platform.OS !== 'android') return
    const stopBridge = startDcApiProviderBridge(router)

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void pullAndHandlePendingDcApiRequests(router, 'app-foreground')
      }
    })

    return () => {
      appStateSubscription.remove()
      stopBridge()
    }
  }, [startupReady, router])
}

export function useDcApiRegistrySync(enabled: boolean): void {
  const syncInFlightRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return

    const syncRegistry = (reason: string) => {
      if (syncInFlightRef.current) return syncInFlightRef.current

      syncInFlightRef.current = runDcApiRegistrySync(reason).finally(() => {
        syncInFlightRef.current = null
      })
      return syncInFlightRef.current
    }

    void syncRegistry('startup-or-credentials-change')
    const unsubscribeCredentials = subscribeCredentialsChange(() => {
      void syncRegistry('credentials-changed')
    })

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncRegistry('app-foreground')
      }
    })

    return () => {
      unsubscribeCredentials()
      appStateSubscription.remove()
    }
  }, [enabled])
}

/** @deprecated Use useDcApiProviderBridge + useDcApiRegistrySync separately. */
export function useDcApiProviderStartup(enabled: boolean): void {
  useDcApiProviderBridge(enabled)
  useDcApiRegistrySync(enabled)
}
