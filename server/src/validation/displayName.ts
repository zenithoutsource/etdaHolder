import blocklist from '../../../shared/profanity-blocklist.json'

const DISPLAY_NAME_PATTERN = /^(?:[a-zA-Z]{2,50}|[a-zA-Z][a-zA-Z\s''-]{0,48}[a-zA-Z])$/

const blockedWords = new Set(blocklist.map((word: string) => word.toLowerCase()))

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
