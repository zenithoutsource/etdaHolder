import { readWalletKeyExpiryLane } from './walletKeyExpiryLane'

describe('readWalletKeyExpiryLane', () => {
  test('rotation record wins over key expired → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: true, hasRotationRecord: true }),
    ).toBe('finish-renewals')
  })

  test('key expired without rotation → create-key', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: true, hasRotationRecord: false }),
    ).toBe('create-key')
  })

  test('neither → idle', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: false, hasRotationRecord: false }),
    ).toBe('idle')
  })

  test('rotation record with non-expired key → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: false, hasRotationRecord: true }),
    ).toBe('finish-renewals')
  })
})
