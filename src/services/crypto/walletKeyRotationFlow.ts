import type { AppDialogAction } from '@/src/components/AppDialog'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { readFirstPendingRenewalCredentialId } from '@/src/services/credentials/pendingRenewalNavigation'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import { rotateWalletKey } from './walletKeyRotation'

type ShowDialog = (options: {
  title: string
  message?: string
  icon?: 'danger' | 'warning'
  actions: AppDialogAction[]
}) => void

function readWalletKeyRotationFailureDialog(error: unknown): {
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

function buildFinishRenewalsDialogActions(
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

export async function performWalletKeyRotationWithDialog(input: {
  showDialog: ShowDialog
  onSuccess?: () => void
  navigateToCredential?: (credentialId: string) => void
}): Promise<void> {
  const navigateToCredential = input.navigateToCredential ?? (() => {})

  try {
    logWalletStep('wallet-key-expiry', 'wallet-key-rotation-start')
    const result = await rotateWalletKey()
    logWalletStep('wallet-key-expiry', 'wallet-key-rotation-complete', {
      affectedCredentialCount: result.affectedCredentialIds.length,
      holderDidLength: result.holderDid.length,
    })
    input.onSuccess?.()
  } catch (error) {
    logWalletError('wallet-key-expiry', 'wallet-key-rotation-failed', error)

    const isBlockedByPendingRenewals =
      error instanceof Error &&
      error.message.includes('WalletKeyRotationBlockedPendingRenewals')

    if (isBlockedByPendingRenewals) {
      const credentialId = readFirstPendingRenewalCredentialId()
      input.showDialog({
        ...readWalletKeyRotationFailureDialog(error),
        icon: 'danger',
        actions: buildFinishRenewalsDialogActions(credentialId, navigateToCredential),
      })
      return
    }

    input.showDialog({
      ...readWalletKeyRotationFailureDialog(error),
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
  }
}
