import { WALLET_PIN_SESSION_GRACE_MS } from '@/src/config/walletPinPolicy'

let lastUnlockAtMs: number | null = null
let backgroundedAtMs: number | null = null

export function recordWalletPinUnlock(now = Date.now()): void {
  lastUnlockAtMs = now
  backgroundedAtMs = null
}

export function clearWalletPinSession(): void {
  lastUnlockAtMs = null
  backgroundedAtMs = null
}

export function markWalletPinSessionBackgrounded(now = Date.now()): void {
  if (lastUnlockAtMs === null) return
  if (backgroundedAtMs !== null) return
  backgroundedAtMs = now
}

export function markWalletPinSessionForegrounded(): void {
  backgroundedAtMs = null
}

export function readWalletPinUnlockAtMs(): number | null {
  return lastUnlockAtMs
}

export function isWalletPinSessionActive(now = Date.now()): boolean {
  if (lastUnlockAtMs === null) return false
  if (backgroundedAtMs === null) return true
  return now - backgroundedAtMs < WALLET_PIN_SESSION_GRACE_MS
}

export function readWalletPinSessionRemainingMs(now = Date.now()): number {
  if (lastUnlockAtMs === null) return 0
  if (backgroundedAtMs === null) return WALLET_PIN_SESSION_GRACE_MS
  return Math.max(0, WALLET_PIN_SESSION_GRACE_MS - (now - backgroundedAtMs))
}
