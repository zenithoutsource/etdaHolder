import { useState } from 'react'

import { useAppDialog } from '@/src/components/AppDialog'
import { WalletKeyExpiredModal } from '@/src/components/WalletKeyExpiredModal'
import { useWalletKeyExpired } from '@/src/hooks/useWalletKeyExpired'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { rotateWalletKey } from '@/src/services/crypto/walletKeyRotation'

export function WalletKeyExpiryHost() {
  const { isExpired, refreshExpiryState } = useWalletKeyExpired()
  const { showDialog } = useAppDialog()
  const [isRotatingWalletKey, setIsRotatingWalletKey] = useState(false)

  async function handleCreateNewWalletKey() {
    setIsRotatingWalletKey(true)
    try {
      await rotateWalletKey()
      refreshExpiryState()
    } catch (error) {
      logWalletError('wallet-key-expiry', 'wallet-key-rotation-failed', error)
      showDialog({
        title: 'ไม่สามารถสร้างกุญแจใหม่ได้',
        message: 'กรุณาลองใหม่อีกครั้ง',
        icon: 'danger',
        actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
      })
    } finally {
      setIsRotatingWalletKey(false)
    }
  }

  return (
    <WalletKeyExpiredModal
      visible={isExpired}
      isRotating={isRotatingWalletKey}
      onCreateNewKey={() => {
        void handleCreateNewWalletKey()
      }}
    />
  )
}
