import { shouldShowWalletKeyExpiredModal } from './WalletKeyExpiryHost'

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
