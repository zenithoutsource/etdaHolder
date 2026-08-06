import {
  clearWalletPinSession,
  isWalletPinSessionActive,
  markWalletPinSessionBackgrounded,
  markWalletPinSessionForegrounded,
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

  test('stays active while the app remains in the foreground past the grace window', () => {
    const unlockedAt = 10_000
    recordWalletPinUnlock(unlockedAt)

    expect(isWalletPinSessionActive(unlockedAt + WALLET_PIN_SESSION_GRACE_MS + 60_000)).toBe(true)
    expect(readWalletPinSessionRemainingMs(unlockedAt + 60_000)).toBe(WALLET_PIN_SESSION_GRACE_MS)
  })

  test('stays active when backgrounded inside the grace window', () => {
    recordWalletPinUnlock(10_000)
    markWalletPinSessionBackgrounded(20_000)

    expect(isWalletPinSessionActive(20_000 + WALLET_PIN_SESSION_GRACE_MS - 1)).toBe(true)
    expect(readWalletPinSessionRemainingMs(20_000 + 60_000)).toBe(
      WALLET_PIN_SESSION_GRACE_MS - 60_000,
    )
  })

  test('expires after background idle exceeds the grace window', () => {
    recordWalletPinUnlock(10_000)
    markWalletPinSessionBackgrounded(20_000)

    expect(isWalletPinSessionActive(20_000 + WALLET_PIN_SESSION_GRACE_MS)).toBe(false)
    expect(readWalletPinSessionRemainingMs(20_000 + WALLET_PIN_SESSION_GRACE_MS)).toBe(0)
  })

  test('keeps the earliest background timestamp when marked again', () => {
    recordWalletPinUnlock(10_000)
    markWalletPinSessionBackgrounded(20_000)
    markWalletPinSessionBackgrounded(20_000 + 30_000)

    expect(isWalletPinSessionActive(20_000 + WALLET_PIN_SESSION_GRACE_MS)).toBe(false)
  })

  test('foreground resume clears background idle so the next leave starts a fresh window', () => {
    recordWalletPinUnlock(10_000)
    markWalletPinSessionBackgrounded(20_000)
    markWalletPinSessionForegrounded()

    expect(isWalletPinSessionActive(20_000 + WALLET_PIN_SESSION_GRACE_MS + 1)).toBe(true)

    markWalletPinSessionBackgrounded(20_000 + WALLET_PIN_SESSION_GRACE_MS + 1)
    expect(
      isWalletPinSessionActive(20_000 + WALLET_PIN_SESSION_GRACE_MS + 1 + WALLET_PIN_SESSION_GRACE_MS - 1),
    ).toBe(true)
  })

  test('clearWalletPinSession resets unlock and background idle', () => {
    recordWalletPinUnlock(10_000)
    markWalletPinSessionBackgrounded(11_000)
    clearWalletPinSession()

    expect(isWalletPinSessionActive(11_001)).toBe(false)
  })

  test('recordWalletPinUnlock clears any previous background idle', () => {
    recordWalletPinUnlock(10_000)
    markWalletPinSessionBackgrounded(11_000)
    recordWalletPinUnlock(12_000)

    expect(isWalletPinSessionActive(12_000 + WALLET_PIN_SESSION_GRACE_MS + 1)).toBe(true)
  })
})
