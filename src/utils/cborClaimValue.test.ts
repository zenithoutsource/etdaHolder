import { isCborTaggedDateValue, readCborTaggedValue, readIsoDateClaimValue } from './cborClaimValue'

describe('cborClaimValue', () => {
  test('reads tag and __tag wrapped values', () => {
    expect(readCborTaggedValue({ tag: 1004, value: '1990-01-01' })).toBe('1990-01-01')
    expect(readCborTaggedValue({ __tag: 1004, value: '2031-08-19' })).toBe('2031-08-19')
  })

  test('reads ISO date claim values from plain and tagged inputs', () => {
    expect(readIsoDateClaimValue('1990-01-01T00:00:00.000Z')).toBe('1990-01-01')
    expect(readIsoDateClaimValue({ __tag: 1004, value: '2026-08-20' })).toBe('2026-08-20')
  })
})
