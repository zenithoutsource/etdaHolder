import { logWalletStep } from '../debug/walletLogger'
import { getMetaStorage } from '../storage/storage'

import { notifyWalletKeyRegistrationChanged } from './walletKeyExpiryWatch'

export const ED25519_PUBLIC_KEY_STORAGE = 'wallet.ed25519_pub_key'
export const KEY_REGISTERED_AT_STORAGE = 'wallet.key_registered_at'

export function hasWalletKey(): boolean {
  return !!getMetaStorage().getString(ED25519_PUBLIC_KEY_STORAGE)
}

/** Sets wallet.key_registered_at only when absent (first bind / backfill). */
export function seedInitialWalletKeyRegisteredAt(registeredAt: string): boolean {
  if (getMetaStorage().getString(KEY_REGISTERED_AT_STORAGE)) return false

  getMetaStorage().set(KEY_REGISTERED_AT_STORAGE, registeredAt)
  notifyWalletKeyRegistrationChanged()
  logWalletStep('crypto', 'wallet-key-registered-at-seeded', { registeredAt })
  return true
}
