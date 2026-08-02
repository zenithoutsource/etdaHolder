import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { readMsUntilWalletKeyExpiry } from '@/src/config/walletKeyPolicy'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { getWalletKeyRegisteredAt, hasWalletKey } from '@/src/services/crypto/crypto'
import { subscribeWalletKeyRegistrationChange } from '@/src/services/crypto/walletKeyExpiryWatch'
import { isWalletKeyExpired } from '@/src/services/crypto/walletKeyRotation'

const MAX_TIMEOUT_MS = 2_147_483_647

type UseWalletKeyExpiredResult = {
  isExpired: boolean
  refreshExpiryState: () => void
}

export function useWalletKeyExpired(): UseWalletKeyExpiredResult {
  const [isExpired, setIsExpired] = useState(() => isWalletKeyExpired())

  const refreshExpiryState = useCallback(() => {
    const expired = isWalletKeyExpired()
    setIsExpired(expired)
    logWalletStep('wallet-key-expiry', 'refresh-state', {
      expired,
      hasWalletKey: hasWalletKey(),
      registeredAt: getWalletKeyRegisteredAt(),
    })
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const clearScheduledCheck = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    const scheduleExpiryCheck = () => {
      clearScheduledCheck()

      if (isWalletKeyExpired()) {
        setIsExpired(true)
        return
      }

      setIsExpired(false)

      const msUntilExpiry = readMsUntilWalletKeyExpiry(
        getWalletKeyRegisteredAt(),
      )
      if (msUntilExpiry === undefined) {
        return
      }

      if (msUntilExpiry <= 0) {
        refreshExpiryState()
        return
      }

      const delayMs = Math.min(msUntilExpiry + 50, MAX_TIMEOUT_MS)
      timeoutId = setTimeout(() => {
        refreshExpiryState()
        scheduleExpiryCheck()
      }, delayMs)
    }

    refreshExpiryState()
    scheduleExpiryCheck()

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        return
      }

      refreshExpiryState()
      scheduleExpiryCheck()
    }

    const appStateSubscription = AppState.addEventListener(
      'change',
      onAppStateChange,
    )
    const unregisterRegistrationChange = subscribeWalletKeyRegistrationChange(
      () => {
        refreshExpiryState()
        scheduleExpiryCheck()
      },
    )

    return () => {
      clearScheduledCheck()
      appStateSubscription.remove()
      unregisterRegistrationChange()
    }
  }, [refreshExpiryState])

  return { isExpired, refreshExpiryState }
}
