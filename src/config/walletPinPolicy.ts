const DEFAULT_WALLET_PIN_SESSION_GRACE_MS = 5 * 60 * 1000

export function readWalletPinSessionGraceMs(
  raw = process.env.EXPO_PUBLIC_WALLET_PIN_SESSION_GRACE_MS,
): number {
  if (!raw) return DEFAULT_WALLET_PIN_SESSION_GRACE_MS

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WALLET_PIN_SESSION_GRACE_MS
  }

  return parsed
}

export const WALLET_PIN_SESSION_GRACE_MS = readWalletPinSessionGraceMs()
