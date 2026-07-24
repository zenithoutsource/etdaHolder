export const WALLET_CRYPTO_V2_META_KEY = 'wallet.crypto.v2_enabled'
export const WALLET_ATTEST_WUA_KEY = 'wallet.attest.wua'
export const WALLET_ATTEST_WIA_KEY = 'wallet.attest.wia'

export function readIssuancePendingKeyTtlMs(): number {
  return Number(process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS) || 1_800_000
}
