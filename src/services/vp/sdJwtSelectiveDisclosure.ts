import { collectDisplayFieldMatchKeys, findDisplayFieldForClaimKey, getCardSchema } from '@/src/config/cardSchemas'
import { normalizeClaimKey } from '@/src/utils/claimKeyNormalization'
import { base64UrlDecodeToString, decodeJwtPayload } from '@/src/utils/jwtUtils'

function readDisclosureClaimKey(segment: string): string | undefined {
  let decoded: unknown
  try {
    decoded = JSON.parse(base64UrlDecodeToString(segment)) as unknown
  } catch {
    throw new Error('PresentationCredentialInvalid: SD-JWT disclosure is malformed')
  }

  if (!Array.isArray(decoded) || decoded.length < 2) {
    throw new Error('PresentationCredentialInvalid: SD-JWT disclosure is malformed')
  }

  const claimKey = decoded[1]
  return typeof claimKey === 'string' ? claimKey : undefined
}

export function countSdJwtDisclosureSegments(rawSdJwt: string): number {
  const segments = rawSdJwt.split('~')
  return segments.slice(1).filter((segment) => {
    if (!segment) return false
    // Compact JWTs (issuer/KB) have three dot-separated parts; disclosures do not.
    return segment.split('.').length !== 3
  }).length
}

/**
 * Expand claim keys with card-schema aliases + DCQL path forms so
 * `fullName` matches Issuer wire key `full_name`, `graduationYear` ↔ `graduation_date`, etc.
 */
export function expandClaimKeysForSdJwtMatch(
  keys: readonly string[],
  documentType?: string,
): string[] {
  const expanded = new Set<string>()
  for (const key of keys) {
    expanded.add(key)
    if (!documentType) continue
    const field = findDisplayFieldForClaimKey(getCardSchema(documentType).displayFields, key)
    if (!field) continue
    for (const matchKey of collectDisplayFieldMatchKeys(field)) expanded.add(matchKey)
  }
  return [...expanded]
}

/**
 * Selects the object-property disclosures requested by a DCQL query.
 * An omitted claim filter means the request did not constrain disclosures.
 */
export function selectSdJwtDisclosures(
  rawSdJwt: string,
  requestedClaimKeys?: readonly string[],
  options?: { documentType?: string },
): string {
  if (!requestedClaimKeys) return rawSdJwt

  const requestedKeys = new Set(
    expandClaimKeysForSdJwtMatch(requestedClaimKeys, options?.documentType).map(normalizeClaimKey),
  )
  const segments = rawSdJwt.split('~')
  const issuerJwt = segments[0]
  if (!issuerJwt) {
    throw new Error('PresentationCredentialInvalid: SD-JWT issuer JWT is missing')
  }

  const selectedDisclosures = segments.slice(1).filter((segment) => {
    if (!segment) return false
    if (segment.split('.').length === 3) return false
    const claimKey = readDisclosureClaimKey(segment)
    return claimKey !== undefined && requestedKeys.has(normalizeClaimKey(claimKey))
  })

  if (requestedClaimKeys.length > 0 && selectedDisclosures.length === 0) {
    const available = countSdJwtDisclosureSegments(rawSdJwt)
    const sdCount = readIssuerSdHashCount(issuerJwt)
    throw new Error(
      `PresentationCredentialInvalid: no SD-JWT disclosures selected for requested claims (available=${available}, _sd=${sdCount ?? 'none'}, requested=${requestedClaimKeys.length})`,
    )
  }

  const trailingSeparator = rawSdJwt.endsWith('~') ? '~' : ''
  if (selectedDisclosures.length === 0) {
    return `${issuerJwt}${trailingSeparator}`
  }
  return `${issuerJwt}~${selectedDisclosures.join('~')}${trailingSeparator}`
}

function readIssuerSdHashCount(issuerJwt: string): number | undefined {
  try {
    const payload = decodeJwtPayload(issuerJwt)
    return Array.isArray(payload?._sd) ? payload._sd.length : undefined
  } catch {
    return undefined
  }
}
