import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { readNearestCredentialExpiryBoundaryMs } from '@/src/services/credentials/credentialDocumentExpiry'
import { rescheduleDocumentExpiryNotifications } from '@/src/services/notifications/documentExpiryNotificationService'
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

      const credentials = readStoredCredentials()
      void rescheduleDocumentExpiryNotifications(credentials)

      const delayMs = readNearestCredentialExpiryBoundaryMs(credentials)
      if (delayMs === undefined || delayMs <= 0) {
        return
      }

      timeoutId = setTimeout(() => {
        publishExpiryRevision()
        refreshExpiryWatch()
        scheduleBoundaryCheck()
      }, Math.min(delayMs + 50, MAX_TIMEOUT_MS))
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
