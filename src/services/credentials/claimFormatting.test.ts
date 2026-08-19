import {
  HIDDEN_CLAIM_KEYS,
  hasAnyClaimValue,
  hasClaimValue,
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

  test('hasAnyClaimValue treats binary and aliased keys as present', () => {
    expect(hasClaimValue(new Uint8Array([0xff, 0xd8]))).toBe(true)
    expect(hasClaimValue('')).toBe(false)
    expect(hasAnyClaimValue({ portrait: new Uint8Array([1, 2]) }, ['photo', 'portrait'])).toBe(true)
    expect(hasAnyClaimValue({ licenceClass: 'B' }, ['license_type', 'licenceClass'])).toBe(true)
    expect(hasAnyClaimValue({ givenName: 'Ada' }, ['full_name'])).toBe(false)
  })
})
