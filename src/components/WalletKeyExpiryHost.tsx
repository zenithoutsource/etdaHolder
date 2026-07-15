import { useState } from 'react'

import { useAppDialog } from '@/src/components/AppDialog'
import { WalletKeyExpiredModal } from '@/src/components/WalletKeyExpiredModal'
import { useWalletKeyExpired } from '@/src/hooks/useWalletKeyExpired'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { rotateWalletKey } from '@/src/services/crypto/walletKeyRotation'

export function readWalletKeyRotationFailureDialog(error: unknown): { title: string; message: string } {
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

export function shouldShowWalletKeyExpiredModal({
  isExpired,
  isRotatingWalletKey,
}: {
  isExpired: boolean
  isRotatingWalletKey: boolean
}): boolean {
  return isExpired && !isRotatingWalletKey
}

export function WalletKeyExpiryHost() {
  const { isExpired, refreshExpiryState } = useWalletKeyExpired()
  const { showDialog } = useAppDialog()
  const [isRotatingWalletKey, setIsRotatingWalletKey] = useState(false)

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
        isExpired,
        isRotatingWalletKey,
      })}
      isRotating={isRotatingWalletKey}
      onCreateNewKey={() => {
        void handleCreateNewWalletKey()
      }}
    />
  )
}
