export type WalletKeyExpiryLane = 'create-key' | 'finish-renewals' | 'idle'

export function readWalletKeyExpiryLane(input: {
  keyExpired: boolean
  hasRotationRecord: boolean
  walletCryptoV2Enabled: boolean
}): WalletKeyExpiryLane {
  if (input.walletCryptoV2Enabled) return 'idle'
  if (input.hasRotationRecord) return 'finish-renewals'
  if (input.keyExpired) return 'create-key'
  return 'idle'
}
