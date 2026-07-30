import { readWalletKeyExpiryLane } from './walletKeyExpiryLane'

describe('readWalletKeyExpiryLane', () => {
  test('v2 per-credential crypto ignores the legacy wallet-key expiry lane', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: true,
        hasRotationRecord: false,
        walletCryptoV2Enabled: true,
      }),
    ).toBe('idle')
  })

  test('rotation record wins over key expired → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: true,
        hasRotationRecord: true,
        walletCryptoV2Enabled: false,
      }),
    ).toBe('finish-renewals')
  })

  test('key expired without rotation → create-key', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: true,
        hasRotationRecord: false,
        walletCryptoV2Enabled: false,
      }),
    ).toBe('create-key')
  })

  test('neither → idle', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: false,
        hasRotationRecord: false,
        walletCryptoV2Enabled: false,
      }),
    ).toBe('idle')
  })

  test('rotation record with non-expired key → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: false,
        hasRotationRecord: true,
        walletCryptoV2Enabled: false,
      }),
    ).toBe('finish-renewals')
  })
})
