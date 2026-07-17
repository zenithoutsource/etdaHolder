import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

import { useAppDialog, type AppDialogAction } from '@/src/components/AppDialog'
import { WalletKeyExpiredModal } from '@/src/components/WalletKeyExpiredModal'
import { useWalletKeyExpired } from '@/src/hooks/useWalletKeyExpired'
import { readFirstPendingRenewalCredentialId } from '@/src/services/credentials/pendingRenewalNavigation'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import {
  readWalletKeyExpiryLane,
  type WalletKeyExpiryLane,
} from '@/src/services/crypto/walletKeyExpiryLane'
import {
  readWalletKeyRotationRecord,
  rotateWalletKey,
} from '@/src/services/crypto/walletKeyRotation'

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
}: {
  lane: WalletKeyExpiryLane
  isRotatingWalletKey: boolean
}): boolean {
  return lane === 'create-key' && !isRotatingWalletKey
}

export function shouldShowPendingRenewalsDialog({
  lane,
  isExpired,
}: {
  lane: WalletKeyExpiryLane
  isExpired: boolean
}): boolean {
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

export function WalletKeyExpiryHost() {
  const { isExpired, refreshExpiryState } = useWalletKeyExpired()
  const { showDialog } = useAppDialog()
  const [isRotatingWalletKey, setIsRotatingWalletKey] = useState(false)
  const pendingRenewalsDialogShownRef = useRef(false)

  const lane = readWalletKeyExpiryLane({
    keyExpired: isExpired,
    hasRotationRecord: Boolean(readWalletKeyRotationRecord()),
  })

  useEffect(() => {
    if (lane !== 'finish-renewals') {
      pendingRenewalsDialogShownRef.current = false
      return
    }

    if (!shouldShowPendingRenewalsDialog({ lane, isExpired })) {
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
  }, [isExpired, lane, showDialog])

  async function handleCreateNewWalletKey() {
    setIsRotatingWalletKey(true)
    try {
      logWalletStep('wallet-key-expiry', 'wallet-key-rotation-start')
      const result = await rotateWalletKey()
      logWalletStep('wallet-key-expiry', 'wallet-key-rotation-complete', {
        affectedCredentialCount: result.affectedCredentialIds.length,
        holderDidLength: result.holderDid.length,
      })
      refreshExpiryState()
    } catch (error) {
      logWalletError('wallet-key-expiry', 'wallet-key-rotation-failed', error)

      if (isWalletKeyRotationBlockedByPendingRenewals(error)) {
        const credentialId = readFirstPendingRenewalCredentialId()
        showDialog({
          ...readWalletKeyRotationFailureDialog(error),
          icon: 'danger',
          actions: buildFinishRenewalsDialogActions(
            credentialId,
            navigateToPendingRenewalCredential,
          ),
        })
        return
      }

      showDialog({
        ...readWalletKeyRotationFailureDialog(error),
        icon: 'danger',
        actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
      })
    } finally {
      setIsRotatingWalletKey(false)
    }
  }

  return (
    <WalletKeyExpiredModal
      visible={shouldShowWalletKeyExpiredModal({
        lane,
        isRotatingWalletKey,
      })}
      isRotating={isRotatingWalletKey}
      onCreateNewKey={() => {
        void handleCreateNewWalletKey()
      }}
    />
  )
}
