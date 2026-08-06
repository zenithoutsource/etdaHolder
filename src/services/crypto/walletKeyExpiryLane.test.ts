import { readWalletKeyExpiryLane } from './walletKeyExpiryLane'

describe('readWalletKeyExpiryLane', () => {
  test('key expired on v2 wallets still enters create-key lane', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: true,
        hasRotationRecord: false,
      }),
    ).toBe('create-key')
  })

  test('rotation record wins over key expired → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: true,
        hasRotationRecord: true,
      }),
    ).toBe('finish-renewals')
  })

  test('key expired without rotation → create-key', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: true,
        hasRotationRecord: false,
      }),
    ).toBe('create-key')
  })

  test('neither → idle', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: false,
        hasRotationRecord: false,
      }),
    ).toBe('idle')
  })

  test('rotation record with non-expired key → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({
        keyExpired: false,
        hasRotationRecord: true,
      }),
    ).toBe('finish-renewals')
  })
})
