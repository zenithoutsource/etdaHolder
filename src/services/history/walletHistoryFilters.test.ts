import type { WalletHistoryEventKind } from './walletEventLog'
import {
  parseWalletHistoryFilter,
  readWalletHistoryFilterForEventKind,
} from './walletHistoryFilters'

describe('parseWalletHistoryFilter', () => {
  test('accepts the three History chip ids', () => {
    expect(parseWalletHistoryFilter('issuance')).toBe('issuance')
    expect(parseWalletHistoryFilter('presentation')).toBe('presentation')
    expect(parseWalletHistoryFilter('lifecycle')).toBe('lifecycle')
  })

  test('reads the first value when Expo passes an array', () => {
    expect(parseWalletHistoryFilter(['lifecycle', 'issuance'])).toBe('lifecycle')
  })

  test('returns undefined for missing or invalid values', () => {
    expect(parseWalletHistoryFilter(undefined)).toBeUndefined()
    expect(parseWalletHistoryFilter(null)).toBeUndefined()
    expect(parseWalletHistoryFilter('')).toBeUndefined()
    expect(parseWalletHistoryFilter('all')).toBeUndefined()
    expect(parseWalletHistoryFilter(['nope'])).toBeUndefined()
  })
})

describe('readWalletHistoryFilterForEventKind', () => {
  test.each<[WalletHistoryEventKind, 'issuance' | 'presentation' | 'lifecycle']>([
    ['credential-received', 'issuance'],
    ['credential-verify-failed', 'issuance'],
    ['presentation-success', 'presentation'],
    ['presentation-declined', 'presentation'],
    ['presentation-failed', 'presentation'],
    ['presentation-access-suspended', 'presentation'],
    ['nfc-presentation-success', 'presentation'],
    ['nfc-presentation-failed', 'presentation'],
    ['credential-revoked', 'lifecycle'],
    ['credential-deleted', 'lifecycle'],
    ['credential-used', 'lifecycle'],
    ['credential-renewal-completed', 'lifecycle'],
    ['backend-sync-success', 'lifecycle'],
    ['backend-sync-failed', 'lifecycle'],
  ])('maps %s to %s', (kind, filter) => {
    expect(readWalletHistoryFilterForEventKind(kind)).toBe(filter)
  })
})
