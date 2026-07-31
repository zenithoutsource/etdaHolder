/**
 * Normalizes claim keys for case- and separator-insensitive matching.
 * Treats birthDate, birth_date, and birth-date as equivalent.
 */
export function normalizeClaimKey(value: string): string {
  return value.replace(/[\s_.-]/g, '').toLowerCase()
}
