import { displayNameValidationMessage, normalizeDisplayName, pinValidationMessage } from './authValidation'

describe('authValidation', () => {
  test('accepts valid English display names', () => {
    expect(displayNameValidationMessage('John Smith')).toBeUndefined()
    expect(normalizeDisplayName('  John   Smith  ')).toBe('John Smith')
  })

  test('rejects non-English display names', () => {
    expect(displayNameValidationMessage('สมชาย')).toBe('Name must use English letters only')
  })

  test('rejects profane display names', () => {
    expect(displayNameValidationMessage('Bad Shit')).toBe('Name contains inappropriate language')
  })

  test('rejects weak PINs', () => {
    expect(pinValidationMessage('123456')).toBe('PIN is too easy to guess')
    expect(pinValidationMessage('482910')).toBeUndefined()
  })
})
