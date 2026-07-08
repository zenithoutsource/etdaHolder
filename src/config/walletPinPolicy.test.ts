import { readWalletPinSessionGraceMs } from './walletPinPolicy'

describe('walletPinPolicy', () => {
  test('defaults to five minutes when env is unset', () => {
    expect(readWalletPinSessionGraceMs(undefined)).toBe(5 * 60 * 1000)
  })

  test('reads grace period from env in milliseconds', () => {
    expect(readWalletPinSessionGraceMs('600000')).toBe(600_000)
  })

  test('falls back to default for invalid env values', () => {
    expect(readWalletPinSessionGraceMs('')).toBe(5 * 60 * 1000)
    expect(readWalletPinSessionGraceMs('not-a-number')).toBe(5 * 60 * 1000)
    expect(readWalletPinSessionGraceMs('0')).toBe(5 * 60 * 1000)
    expect(readWalletPinSessionGraceMs('-1')).toBe(5 * 60 * 1000)
  })
})
