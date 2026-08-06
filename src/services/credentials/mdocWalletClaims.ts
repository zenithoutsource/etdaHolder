import { parseMdocDocument } from '../proximity/mdocParser'

const ISO_18013_NAMESPACE = 'org.iso.18013.5.1'

const ISO_TO_WALLET_CLAIM_KEYS: Readonly<Record<string, string>> = {
  given_name: 'givenName',
  family_name: 'familyName',
  birth_date: 'birthDate',
  document_number: 'licenceNumber',
  expiry_date: 'expiryDate',
  issue_date: 'issuanceDate',
  issuing_country: 'issuingCountry',
}

export function mapIso18013NamespaceClaims(
  namespaces: Record<string, Record<string, string | number | boolean>>,
): Record<string, unknown> {
  const isoClaims = namespaces[ISO_18013_NAMESPACE]
  if (!isoClaims) return {}

  const claims: Record<string, unknown> = {}
  for (const [isoKey, walletKey] of Object.entries(ISO_TO_WALLET_CLAIM_KEYS)) {
    const value = isoClaims[isoKey]
    if (value === undefined) continue
    claims[walletKey] = typeof value === 'string' ? value : String(value)
  }

  const licenceClass = readDrivingPrivilegeLabel(isoClaims.driving_privileges)
  if (licenceClass) {
    claims.licenceClass = licenceClass
  }

  return claims
}

export function extractMdocWalletClaims(
  mdocBytes: Uint8Array,
  decode?: (input: Uint8Array) => unknown,
): Record<string, unknown> {
  const decoder = decode ?? readOptionalCborDecoder()
  if (!decoder) return {}

  try {
    const parsed = parseMdocDocument(mdocBytes, decoder)
    return mapIso18013NamespaceClaims(parsed.namespaces)
  } catch {
    return {}
  }
}

function readOptionalCborDecoder(): ((input: Uint8Array) => unknown) | undefined {
  try {
    // Optional runtime dependency: when installed, mdoc-only credentials expose holder claims in MMKV.
    const { decode } = require('cbor-x') as { decode: (input: Uint8Array) => unknown }
    return decode
  } catch {
    return undefined
  }
}

function readDrivingPrivilegeLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (!Array.isArray(value)) return undefined

  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry.trim()
    }

    if (typeof entry === 'object' && entry !== null) {
      const record = entry as Record<string, unknown>
      const vehicleCategory = record.vehicle_category_code ?? record.vehicleCategoryCode
      if (typeof vehicleCategory === 'string' && vehicleCategory.trim().length > 0) {
        return vehicleCategory.trim()
      }
    }
  }

  return undefined
}
