import type { WalletKeyExpiryLane } from '../crypto/walletKeyExpiryLane'

export function shouldOfferDocumentReissueCta(input: {
  lane: WalletKeyExpiryLane
  documentExpired: boolean
}): boolean {
  return input.documentExpired && input.lane !== 'create-key'
}
