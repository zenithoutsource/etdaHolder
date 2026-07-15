import {
  HIDDEN_CLAIM_KEYS,
  isHiddenClaimKey,
  readClaimText,
  stringifyClaim,
} from './claimFormatting'

describe('claimFormatting', () => {
  test('stringifyClaim formats primitives and JSON', () => {
    expect(stringifyClaim('hello')).toBe('hello')
    expect(stringifyClaim(42)).toBe('42')
    expect(stringifyClaim(true)).toBe('true')
    expect(stringifyClaim(null)).toBe('')
    expect(stringifyClaim({ a: 1 })).toBe('{"a":1}')
  })

  test('isHiddenClaimKey matches protocol claim keys', () => {
    expect(isHiddenClaimKey('iss')).toBe(true)
    expect(isHiddenClaimKey('fullName')).toBe(false)
    expect(HIDDEN_CLAIM_KEYS.has('cnf')).toBe(true)
  })

  test('readClaimText returns first non-empty alias match', () => {
    const claims = { birth_date: '  2001-05-15  ' }
    expect(readClaimText(claims, ['birthDate', 'birth_date'])).toBe('2001-05-15')
    expect(readClaimText(claims, ['missing'])).toBeUndefined()
  })
})
