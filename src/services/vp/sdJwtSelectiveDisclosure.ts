import { base64UrlDecodeToString } from '@/src/utils/jwtUtils'

function normalizeClaimKey(value: string): string {
  return value.replace(/[\s_.-]/g, '').toLowerCase()
}

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

/**
 * Selects the object-property disclosures requested by a DCQL query.
 * An omitted claim filter means the request did not constrain disclosures.
 */
export function selectSdJwtDisclosures(
  rawSdJwt: string,
  requestedClaimKeys?: readonly string[],
): string {
  if (!requestedClaimKeys) return rawSdJwt

  const requestedKeys = new Set(requestedClaimKeys.map(normalizeClaimKey))
  const segments = rawSdJwt.split('~')
  const issuerJwt = segments[0]
  if (!issuerJwt) {
    throw new Error('PresentationCredentialInvalid: SD-JWT issuer JWT is missing')
  }

  const selectedDisclosures = segments.slice(1).filter((segment) => {
    if (!segment) return false
    const claimKey = readDisclosureClaimKey(segment)
    return claimKey !== undefined && requestedKeys.has(normalizeClaimKey(claimKey))
  })

  const trailingSeparator = rawSdJwt.endsWith('~') ? '~' : ''
  return `${issuerJwt}~${selectedDisclosures.join('~')}${trailingSeparator}`
}
