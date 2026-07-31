import { normalizeClaimKey } from './claimKeyNormalization'

describe('normalizeClaimKey', () => {
  test('treats camelCase, snake_case, and kebab-case as equivalent', () => {
    expect(normalizeClaimKey('birthDate')).toBe('birthdate')
    expect(normalizeClaimKey('birth_date')).toBe('birthdate')
    expect(normalizeClaimKey('birth-date')).toBe('birthdate')
  })

  test('strips whitespace and dots', () => {
    expect(normalizeClaimKey('full name')).toBe('fullname')
    expect(normalizeClaimKey('student.id')).toBe('studentid')
  })

  test('matches policy and schema lookup variants', () => {
    expect(normalizeClaimKey('studentId')).toBe(normalizeClaimKey('student_id'))
    expect(normalizeClaimKey('national_id')).toBe('nationalid')
  })
})
