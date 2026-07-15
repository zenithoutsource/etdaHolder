import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'

import { readWalletKeyRotationFailureDialog, shouldShowWalletKeyExpiredModal } from './WalletKeyExpiryHost'

describe('readWalletKeyRotationFailureDialog', () => {
  test('returns the generic retry copy on the generic failure branch', () => {
    const dialog = readWalletKeyRotationFailureDialog(new Error('Ed25519SeedKeychainWriteFailed'))

    expect(dialog).toEqual({
      title: 'ไม่สามารถสร้างกุญแจใหม่ได้',
      message: 'กรุณาลองใหม่อีกครั้ง',
    })
  })

  test('keeps the blocked-renewals copy without a technical suffix', () => {
    const dialog = readWalletKeyRotationFailureDialog(new Error('WalletKeyRotationBlockedPendingRenewals'))

    expect(dialog).toEqual({
      title: WALLET_HOME_COPY.walletKeyRotationBlockedTitle,
      message: WALLET_HOME_COPY.walletKeyRotationBlockedMessage,
    })
  })
})

describe('shouldShowWalletKeyExpiredModal', () => {
  test('hides the React Native modal while wallet key rotation is in progress', () => {
    expect(shouldShowWalletKeyExpiredModal({
      isExpired: true,
      isRotatingWalletKey: true,
    })).toBe(false)
  })

  test('shows the modal when the key is expired and rotation is idle', () => {
    expect(shouldShowWalletKeyExpiredModal({
      isExpired: true,
      isRotatingWalletKey: false,
    })).toBe(true)
  })
})
