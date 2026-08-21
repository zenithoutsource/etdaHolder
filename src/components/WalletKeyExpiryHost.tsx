/**
 * Global host for key-expiry modal and pending-renewal dialogs/rotation.
 * Journey: P3 (tab shell).
 * Copy: WALLET_HOME_COPY.
 * Layout: WalletKeyExpiredModal (hidden while PIN lock is required); useWalletKeyExpired.
 * Map: docs/CODEMAPS/frontend.md#global-hosts
 */

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

import { useAppDialog, type AppDialogAction } from '@/src/components/AppDialog'
import { WalletKeyExpiredModal } from '@/src/components/WalletKeyExpiredModal'
import { useWalletKeyExpired } from '@/src/hooks/useWalletKeyExpired'
import { hasWalletPin } from '@/src/services/auth/walletPin'
import { isWalletPinLockRequired } from '@/src/services/auth/walletPinNavigation'
import { readFirstPendingRenewalCredentialId } from '@/src/services/credentials/pendingRenewalNavigation'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { isWalletCryptoV2Enabled } from '@/src/services/crypto/walletCryptoActivation'
import {
  readWalletKeyExpiryLane,
  type WalletKeyExpiryLane,
} from '@/src/services/crypto/walletKeyExpiryLane'
import { performWalletKeyRotationWithDialog } from '@/src/services/crypto/walletKeyRotationFlow'
import { readWalletKeyRotationRecord } from '@/src/services/crypto/walletKeyRotation'
import { useAuthStore } from '@/src/store/authStore'

export function readWalletKeyRotationFailureDialog(error: unknown): {
  title: string
  message: string
} {
  const isBlockedByPendingRenewals =
    error instanceof Error &&
    error.message.includes('WalletKeyRotationBlockedPendingRenewals')

  if (isBlockedByPendingRenewals) {
    return {
      title: WALLET_HOME_COPY.walletKeyRotationBlockedTitle,
      message: WALLET_HOME_COPY.walletKeyRotationBlockedMessage,
    }
  }

  return {
    title: 'ไม่สามารถสร้างกุญแจใหม่ได้',
    message: 'กรุณาลองใหม่อีกครั้ง',
  }
}

export function isWalletKeyRotationBlockedByPendingRenewals(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('WalletKeyRotationBlockedPendingRenewals')
  )
}

export function shouldShowWalletKeyExpiredModal({
  lane,
  isRotatingWalletKey,
  usesWalletWideKeyRotation = true,
  pinLockRequired = false,
}: {
  lane: WalletKeyExpiryLane
  isRotatingWalletKey: boolean
  usesWalletWideKeyRotation?: boolean
  pinLockRequired?: boolean
}): boolean {
  if (!usesWalletWideKeyRotation) return false
  if (pinLockRequired) return false
  return lane === 'create-key' && !isRotatingWalletKey
}

export function shouldShowPendingRenewalsDialog({
  lane,
  isExpired,
  usesWalletWideKeyRotation = true,
}: {
  lane: WalletKeyExpiryLane
  isExpired: boolean
  usesWalletWideKeyRotation?: boolean
}): boolean {
  if (!usesWalletWideKeyRotation) return false
  return lane === 'finish-renewals' && isExpired
}

export function buildFinishRenewalsDialogActions(
  credentialId: string | undefined,
  navigateToCredential: (id: string) => void,
): AppDialogAction[] {
  const actions: AppDialogAction[] = []

  if (credentialId) {
    actions.push({
      label: WALLET_HOME_COPY.goFinishRenewals,
      onPress: () => navigateToCredential(credentialId),
    })
  }

  actions.push({
    label: WALLET_HOME_COPY.cancel,
    variant: 'secondary',
  })

  return actions
}

function navigateToPendingRenewalCredential(id: string) {
  router.push(`/(tabs)/credential/${id}`)
}

export function usesWalletWideKeyRotation(): boolean {
  return !isHardwareP256SigningEnabled() && !isWalletCryptoV2Enabled()
}

export function WalletKeyExpiryHost() {
  const { isExpired, refreshExpiryState } = useWalletKeyExpired()
  const { showDialog } = useAppDialog()
  const [isRotatingWalletKey, setIsRotatingWalletKey] = useState(false)
  const pendingRenewalsDialogShownRef = useRef(false)
  const walletWideRotation = usesWalletWideKeyRotation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isPinVerified = useAuthStore((state) => state.isPinVerified)
  const pinLockRequired = isWalletPinLockRequired({
    platform: Platform.OS,
    isAuthenticated,
    isPinVerified,
    hasWalletPin: Platform.OS !== 'web' && hasWalletPin(),
  })

  const lane = readWalletKeyExpiryLane({
    keyExpired: isExpired,
    hasRotationRecord: Boolean(readWalletKeyRotationRecord()),
  })
  const showWalletKeyModal = shouldShowWalletKeyExpiredModal({
    lane,
    isRotatingWalletKey,
    usesWalletWideKeyRotation: walletWideRotation,
    pinLockRequired,
  })

  useEffect(() => {
    if (lane !== 'finish-renewals') {
      pendingRenewalsDialogShownRef.current = false
      return
    }

    if (
      !shouldShowPendingRenewalsDialog({
        lane,
        isExpired,
        usesWalletWideKeyRotation: walletWideRotation,
      })
    ) {
      return
    }

    if (pendingRenewalsDialogShownRef.current) {
      return
    }

    pendingRenewalsDialogShownRef.current = true
    const credentialId = readFirstPendingRenewalCredentialId()

    logWalletStep('wallet-key-expiry', 'pending-renewals-dialog-show', {
      hasCredentialTarget: Boolean(credentialId),
    })

    showDialog({
      title: WALLET_HOME_COPY.walletKeyPendingRenewalsTitle,
      message: WALLET_HOME_COPY.walletKeyPendingRenewalsMessage,
      icon: 'warning',
      actions: buildFinishRenewalsDialogActions(
        credentialId,
        navigateToPendingRenewalCredential,
      ),
    })
  }, [isExpired, lane, showDialog, walletWideRotation])

  async function handleCreateNewWalletKey() {
    setIsRotatingWalletKey(true)
    try {
      await performWalletKeyRotationWithDialog({
        showDialog,
        onSuccess: refreshExpiryState,
        navigateToCredential: navigateToPendingRenewalCredential,
      })
    } finally {
      setIsRotatingWalletKey(false)
    }
  }

  return (
    <WalletKeyExpiredModal
      visible={showWalletKeyModal}
      isRotating={isRotatingWalletKey}
      onCreateNewKey={() => {
        void handleCreateNewWalletKey()
      }}
    />
  )
}
