import {
  readIssuancePendingKeyTtlMs,
  WALLET_ATTEST_WIA_KEY,
  WALLET_ATTEST_WUA_KEY,
  WALLET_CRYPTO_V2_META_KEY,
} from './walletCryptoPolicy'

describe('walletCryptoPolicy', () => {
  const originalTtl = process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS

  afterEach(() => {
    if (originalTtl === undefined) {
      delete process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS
    } else {
      process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS = originalTtl
    }
  })

  test('readIssuancePendingKeyTtlMs defaults to 30 minutes', () => {
    delete process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS
    expect(readIssuancePendingKeyTtlMs()).toBe(1_800_000)
  })

  test('readIssuancePendingKeyTtlMs reads env override', () => {
    process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS = '600000'
    expect(readIssuancePendingKeyTtlMs()).toBe(600_000)
  })

  test('exports stable meta keys', () => {
    expect(WALLET_CRYPTO_V2_META_KEY).toBe('wallet.crypto.v2_enabled')
    expect(WALLET_ATTEST_WUA_KEY).toBe('wallet.attest.wua')
    expect(WALLET_ATTEST_WIA_KEY).toBe('wallet.attest.wia')
  })
})
