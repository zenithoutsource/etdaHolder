import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { readNearestCredentialExpiryBoundaryMs } from '@/src/services/credentials/credentialDocumentExpiry'
import {
  readNearestCredentialKeyExpiryBoundaryMs,
  syncCredentialKeyTtlRenewals,
} from '@/src/services/credentials/credentialKeyExpiry'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { scheduleDocumentExpiryNotifications } from '@/src/services/notifications/documentExpiryNotificationService'
import {
  notifyCredentialsChanged,
  readStoredCredentials,
  subscribeCredentialsChange,
} from '@/src/services/credentials/storedCredentials'

const MAX_TIMEOUT_MS = 2_147_483_647

type UseCredentialExpiryWatchResult = {
  refreshExpiryWatch: () => void
}

export function useCredentialExpiryWatch(): UseCredentialExpiryWatchResult {
  const [, setRefreshTick] = useState(0)

  const refreshExpiryWatch = useCallback(() => {
    setRefreshTick((tick) => tick + 1)
  }, [])

  const publishExpiryRevision = useCallback(() => {
    notifyCredentialsChanged()
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const clearScheduledCheck = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    const scheduleBoundaryCheck = () => {
      clearScheduledCheck()

      try {
        const credentials = readStoredCredentials()
        void scheduleDocumentExpiryNotifications(credentials)
        syncCredentialKeyTtlRenewals()

        const documentDelayMs = readNearestCredentialExpiryBoundaryMs(credentials)
        const keyDelayMs = readNearestCredentialKeyExpiryBoundaryMs()
        const delayMs = [documentDelayMs, keyDelayMs]
          .filter((value): value is number => typeof value === 'number')
          .reduce<number | undefined>(
            (nearest, value) => (nearest === undefined || value < nearest ? value : nearest),
            undefined,
          )
        if (delayMs === undefined || delayMs <= 0) {
          return
        }

        timeoutId = setTimeout(() => {
          publishExpiryRevision()
          refreshExpiryWatch()
          scheduleBoundaryCheck()
        }, Math.min(delayMs + 50, MAX_TIMEOUT_MS))
      } catch (error) {
        logWalletError('expiry-watch', 'boundary-check-failed', error)
      }
    }

    scheduleBoundaryCheck()

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return
      publishExpiryRevision()
      refreshExpiryWatch()
      scheduleBoundaryCheck()
    }

    const appStateSubscription = AppState.addEventListener('change', onAppStateChange)
    const unsubscribeCredentials = subscribeCredentialsChange(() => {
      refreshExpiryWatch()
      scheduleBoundaryCheck()
    })

    return () => {
      clearScheduledCheck()
      appStateSubscription.remove()
      unsubscribeCredentials()
    }
  }, [publishExpiryRevision, refreshExpiryWatch])

  return { refreshExpiryWatch }
}
