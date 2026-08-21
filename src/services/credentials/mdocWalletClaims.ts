import { decode as decodeCborX } from 'cbor-x'

import { base64UrlToBytes } from '@/src/utils/jwtUtils'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { logWalletError } from '../debug/walletLogger'
import { hasClaimValue, isHiddenClaimKey } from './claimFormatting'
import { parseMdocDocument, type ParsedMdocNamespaces } from '../proximity/mdocParser'

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

const WALLET_MAPPED_CLAIM_KEYS = new Set(Object.values(ISO_TO_WALLET_CLAIM_KEYS))

export function mapIso18013NamespaceClaims(
  namespaces: ParsedMdocNamespaces,
): Record<string, unknown> {
  const isoClaims = namespaces[ISO_18013_NAMESPACE]
  if (!isoClaims) return {}

  const claims: Record<string, unknown> = {}
  for (const [isoKey, walletKey] of Object.entries(ISO_TO_WALLET_CLAIM_KEYS)) {
    const value = isoClaims[isoKey]
    if (value === undefined) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      claims[walletKey] = typeof value === 'string' ? value : String(value)
    }
  }

  const licenceClass = readDrivingPrivilegeLabel(isoClaims.driving_privileges)
  if (licenceClass) {
    claims.licenceClass = licenceClass
  }

  const mappedIsoKeys = new Set(Object.keys(ISO_TO_WALLET_CLAIM_KEYS))
  for (const [isoKey, value] of Object.entries(isoClaims)) {
    if (mappedIsoKeys.has(isoKey) || isoKey.startsWith('_') || isHiddenClaimKey(isoKey)) continue
    if (isoKey === 'doctype') continue
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) continue
    if (!hasClaimValue(value)) continue
    claims[isoKey] = value
  }

  return claims
}

export function extractMdocWalletClaims(
  mdocBytes: Uint8Array,
  decode?: (input: Uint8Array) => unknown,
): Record<string, unknown> {
  const decoder = decode ?? decodeMdocCbor
  try {
    const parsed = parseMdocDocument(mdocBytes, decoder)
    return mapIso18013NamespaceClaims(parsed.namespaces)
  } catch (error) {
    logWalletError('oid4vci', 'mdoc-claims-extract-failed', error)
    return {}
  }
}

export function overlayDrivingLicenceMdocClaims(
  record: VerifiableCredentialRecord,
  mdocRawBase64: string,
): VerifiableCredentialRecord {
  if (record.type !== 'DLTDrivingLicence' || !mdocRawBase64) return record

  const mdocClaims = extractMdocWalletClaims(base64UrlToBytes(mdocRawBase64))
  if (Object.keys(mdocClaims).length === 0) return record

  const leftoverIsoClaims: Record<string, unknown> = {}
  const walletMappedClaims: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(mdocClaims)) {
    if (WALLET_MAPPED_CLAIM_KEYS.has(key) || key === 'licenceClass') {
      walletMappedClaims[key] = value
    } else {
      leftoverIsoClaims[key] = value
    }
  }

  return {
    ...record,
    claims: {
      ...leftoverIsoClaims,
      ...record.claims,
      ...walletMappedClaims,
    },
  }
}

function decodeMdocCbor(input: Uint8Array): unknown {
  return decodeCborX(input)
}

export function readDrivingPrivilegeLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const code = readVehicleCategoryCode(entry)
      if (code) return code
    }
    return undefined
  }

  return readVehicleCategoryCode(value)
}

function readVehicleCategoryCode(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (entry instanceof Map) {
    const vehicleCategory = entry.get('vehicle_category_code') ?? entry.get('vehicleCategoryCode')
    return typeof vehicleCategory === 'string' && vehicleCategory.trim().length > 0
      ? vehicleCategory.trim()
      : undefined
  }

  if (typeof entry === 'object' && entry !== null) {
    const record = entry as Record<string, unknown>
    const vehicleCategory = record.vehicle_category_code ?? record.vehicleCategoryCode
    if (typeof vehicleCategory === 'string' && vehicleCategory.trim().length > 0) {
      return vehicleCategory.trim()
    }
  }

  return undefined
}
