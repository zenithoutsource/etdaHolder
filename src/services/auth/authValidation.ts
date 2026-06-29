import blocklist from '../../../shared/profanity-blocklist.json'

const DISPLAY_NAME_PATTERN = /^(?:[a-zA-Z]{2,50}|[a-zA-Z][a-zA-Z\s''-]{0,48}[a-zA-Z])$/

const blockedWords = new Set(blocklist.map((word) => word.toLowerCase()))

export function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function displayNameValidationMessage(name: string): string | undefined {
  const normalized = normalizeDisplayName(name)
  if (normalized.length < 2 || normalized.length > 50) {
    return 'Name must be 2 to 50 characters'
  }
  if (!DISPLAY_NAME_PATTERN.test(normalized)) {
    return 'Name must use English letters only'
  }

  const tokens = normalized.toLowerCase().split(/[\s'-]+/).filter(Boolean)
  for (const token of tokens) {
    if (blockedWords.has(token)) {
      return 'Name contains inappropriate language'
    }
  }

  return undefined
}

const PIN_PATTERN = /^\d{6}$/

const WEAK_PINS = new Set([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '123456',
  '654321',
  '012345',
  '543210',
])

export function pinValidationMessage(pin: string): string | undefined {
  if (!PIN_PATTERN.test(pin)) {
    return 'PIN must be exactly 6 digits'
  }
  if (WEAK_PINS.has(pin)) {
    return 'PIN is too easy to guess'
  }
  return undefined
}

export function isValidEmailFormat(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 254
}
