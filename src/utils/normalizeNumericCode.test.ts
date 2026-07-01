import { normalizeNumericCode } from './normalizeNumericCode'

test('strips non-digits and keeps first six', () => {
  expect(normalizeNumericCode('Your code is 123-456')).toBe('123456')
})

test('truncates to requested length', () => {
  expect(normalizeNumericCode('1234567890', 6)).toBe('123456')
})

test('returns empty string when no digits', () => {
  expect(normalizeNumericCode('no digits here')).toBe('')
})
