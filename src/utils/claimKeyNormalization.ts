/**
 * Normalizes claim keys for case- and separator-insensitive matching.
 * Treats birthDate, birth_date, and birth-date as equivalent.
 */
export function normalizeClaimKey(value: string): string {
  return value.replace(/[\s_.-]/g, '').toLowerCase()
}

/** Last path segment of an mdoc field key (`namespace.identifier` or `namespace:identifier`). */
export function readMdocElementIdentifier(claimKey: string): string {
  const colon = claimKey.lastIndexOf(':')
  if (colon >= 0) return claimKey.slice(colon + 1)
  const lastDot = claimKey.lastIndexOf('.')
  if (lastDot >= 0) return claimKey.slice(lastDot + 1)
  return claimKey
}
