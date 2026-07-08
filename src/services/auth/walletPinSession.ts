import { WALLET_PIN_SESSION_GRACE_MS } from '@/src/config/walletPinPolicy'

let lastUnlockAtMs: number | null = null

export function recordWalletPinUnlock(now = Date.now()): void {
  lastUnlockAtMs = now
}

export function clearWalletPinSession(): void {
  lastUnlockAtMs = null
}

export function readWalletPinUnlockAtMs(): number | null {
  return lastUnlockAtMs
}

export function isWalletPinSessionActive(now = Date.now()): boolean {
  if (lastUnlockAtMs === null) return false
  return now - lastUnlockAtMs < WALLET_PIN_SESSION_GRACE_MS
}

export function readWalletPinSessionRemainingMs(now = Date.now()): number {
  if (lastUnlockAtMs === null) return 0
  return Math.max(0, WALLET_PIN_SESSION_GRACE_MS - (now - lastUnlockAtMs))
}
