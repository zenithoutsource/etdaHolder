type WalletKeyRegistrationListener = () => void

const listeners = new Set<WalletKeyRegistrationListener>()

export function subscribeWalletKeyRegistrationChange(
  listener: WalletKeyRegistrationListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyWalletKeyRegistrationChanged(): void {
  for (const listener of listeners) {
    listener()
  }
}
