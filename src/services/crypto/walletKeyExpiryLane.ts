export type WalletKeyExpiryLane = 'create-key' | 'finish-renewals' | 'idle'

export function readWalletKeyExpiryLane(input: {
  keyExpired: boolean
  hasRotationRecord: boolean
}): WalletKeyExpiryLane {
  if (input.hasRotationRecord) return 'finish-renewals'
  if (input.keyExpired) return 'create-key'
  return 'idle'
}
