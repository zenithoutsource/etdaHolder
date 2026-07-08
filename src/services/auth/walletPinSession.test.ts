import {
  clearWalletPinSession,
  isWalletPinSessionActive,
  readWalletPinSessionRemainingMs,
  recordWalletPinUnlock,
} from './walletPinSession'

import { WALLET_PIN_SESSION_GRACE_MS } from '@/src/config/walletPinPolicy'

describe('walletPinSession', () => {
  beforeEach(() => {
    clearWalletPinSession()
  })

  test('is inactive before any unlock', () => {
    expect(isWalletPinSessionActive(1_000)).toBe(false)
    expect(readWalletPinSessionRemainingMs(1_000)).toBe(0)
  })

  test('stays active within the grace window', () => {
    const unlockedAt = 10_000
    recordWalletPinUnlock(unlockedAt)

    expect(isWalletPinSessionActive(unlockedAt)).toBe(true)
    expect(isWalletPinSessionActive(unlockedAt + WALLET_PIN_SESSION_GRACE_MS - 1)).toBe(true)
    expect(readWalletPinSessionRemainingMs(unlockedAt + 60_000)).toBe(
      WALLET_PIN_SESSION_GRACE_MS - 60_000,
    )
  })

  test('expires after the grace window', () => {
    const unlockedAt = 10_000
    recordWalletPinUnlock(unlockedAt)

    expect(isWalletPinSessionActive(unlockedAt + WALLET_PIN_SESSION_GRACE_MS)).toBe(false)
    expect(readWalletPinSessionRemainingMs(unlockedAt + WALLET_PIN_SESSION_GRACE_MS)).toBe(0)
  })

  test('clearWalletPinSession resets the unlock timestamp', () => {
    recordWalletPinUnlock(10_000)
    clearWalletPinSession()

    expect(isWalletPinSessionActive(10_001)).toBe(false)
  })
})
