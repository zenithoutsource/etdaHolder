export const HIDDEN_CLAIM_KEYS = new Set([
  'vc',
  'iss',
  'iat',
  'nbf',
  'exp',
  'jti',
  'vct',
  'cnf',
  'status',
])

export function isHiddenClaimKey(key: string): boolean {
  return HIDDEN_CLAIM_KEYS.has(key)
}

export function stringifyClaim(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

export function readClaimText(claims: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = stringifyClaim(claims[key]).trim()
    if (text.length > 0) return text
  }
  return undefined
}
