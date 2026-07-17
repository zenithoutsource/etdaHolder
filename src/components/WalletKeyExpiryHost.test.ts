import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'

import {
  buildFinishRenewalsDialogActions,
  readWalletKeyRotationFailureDialog,
  shouldShowPendingRenewalsDialog,
  shouldShowWalletKeyExpiredModal,
} from './WalletKeyExpiryHost'

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
    expect(
      shouldShowWalletKeyExpiredModal({
        lane: 'create-key',
        isRotatingWalletKey: true,
      }),
    ).toBe(false)
  })

  test('hides create-key modal when lane is finish-renewals', () => {
    expect(
      shouldShowWalletKeyExpiredModal({
        lane: 'finish-renewals',
        isRotatingWalletKey: false,
      }),
    ).toBe(false)
  })

  test('shows create-key modal only for create-key lane when idle', () => {
    expect(
      shouldShowWalletKeyExpiredModal({
        lane: 'create-key',
        isRotatingWalletKey: false,
      }),
    ).toBe(true)
  })

  test('hides create-key modal when lane is idle', () => {
    expect(
      shouldShowWalletKeyExpiredModal({
        lane: 'idle',
        isRotatingWalletKey: false,
      }),
    ).toBe(false)
  })
})

describe('shouldShowPendingRenewalsDialog', () => {
  test('shows when finish-renewals lane and key is expired again', () => {
    expect(
      shouldShowPendingRenewalsDialog({
        lane: 'finish-renewals',
        isExpired: true,
      }),
    ).toBe(true)
  })

  test('hides during quiet mid-renewal when key is not expired', () => {
    expect(
      shouldShowPendingRenewalsDialog({
        lane: 'finish-renewals',
        isExpired: false,
      }),
    ).toBe(false)
  })
})

describe('buildFinishRenewalsDialogActions', () => {
  test('includes primary navigation and cancel when a credential id exists', () => {
    const navigate = jest.fn()
    const actions = buildFinishRenewalsDialogActions('cred-1', navigate)

    expect(actions).toHaveLength(2)
    expect(actions[0]).toEqual({
      label: WALLET_HOME_COPY.goFinishRenewals,
      onPress: expect.any(Function),
    })
    expect(actions[1]).toEqual({
      label: WALLET_HOME_COPY.cancel,
      variant: 'secondary',
    })

    actions[0]?.onPress?.()
    expect(navigate).toHaveBeenCalledWith('cred-1')
  })

  test('includes only cancel when no credential id is available', () => {
    const navigate = jest.fn()
    const actions = buildFinishRenewalsDialogActions(undefined, navigate)

    expect(actions).toEqual([
      {
        label: WALLET_HOME_COPY.cancel,
        variant: 'secondary',
      },
    ])
  })
})
