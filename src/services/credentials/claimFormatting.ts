import { normalizeClaimKey } from '@/src/utils/claimKeyNormalization'

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

export function hasClaimValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return !Number.isNaN(value)
  if (typeof value === 'boolean') return true
  if (value instanceof Uint8Array) return value.length > 0
  if (ArrayBuffer.isView(value)) return value.byteLength > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return stringifyClaim(value).trim().length > 0
}

export function hasAnyClaimValue(claims: Record<string, unknown>, keys: string[]): boolean {
  const normalizedKeys = new Map(Object.keys(claims).map((key) => [normalizeClaimKey(key), key]))
  for (const key of keys) {
    const matchedKey = Object.prototype.hasOwnProperty.call(claims, key)
      ? key
      : normalizedKeys.get(normalizeClaimKey(key))
    if (matchedKey && hasClaimValue(claims[matchedKey])) return true
  }
  return false
}

export function readClaimText(claims: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = stringifyClaim(claims[key]).trim()
    if (text.length > 0) return text
  }
  return undefined
}
