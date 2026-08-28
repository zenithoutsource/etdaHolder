import { decode as decodeCborX } from 'cbor-x'

import { base64UrlToBytes } from '@/src/utils/jwtUtils'
import { readIsoDateClaimValue } from '@/src/utils/cborClaimValue'
import { isFirstPartyIssuerOrigin, resolveFirstPartyType } from '../../config/firstPartyCredential'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { logWalletError } from '../debug/walletLogger'
import { hasClaimValue, isHiddenClaimKey } from './claimFormatting'
import { parseMdocDocument, type ParsedMdocNamespaces } from '../proximity/mdocParser'

const ISO_18013_NAMESPACE = 'org.iso.18013.5.1'
const MDOC_PHOTO_CLAIM_KEYS = new Set(['portrait', 'photo', 'image'])

const ISO_TO_WALLET_CLAIM_KEYS: Readonly<Record<string, string>> = {
  given_name: 'givenName',
  family_name: 'familyName',
  given_name_national_character: 'givenNameTh',
  family_name_national_character: 'familyNameTh',
  birth_date: 'birthDate',
  document_number: 'licenceNumber',
  expiry_date: 'expiryDate',
  issue_date: 'issuanceDate',
  issuing_country: 'issuingCountry',
  issuing_authority: 'issuingAuthority',
  un_distinguishing_sign: 'unDistinguishingSign',
  nationality: 'nationality',
  age_over_18: 'ageOver18',
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
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
      if (MDOC_PHOTO_CLAIM_KEYS.has(isoKey)) {
        claims[isoKey] = readBinaryClaimValue(value)
      }
      continue
    }
    if (!hasClaimValue(value)) continue
    claims[isoKey] = value
  }

  return claims
}

/** Keeps namespace identifiers for third-party / interop display (issuer wire keys). */
export function mapMdocNamespaceIssuerClaims(
  namespaces: ParsedMdocNamespaces,
): Record<string, unknown> {
  const claims: Record<string, unknown> = {}
  for (const [namespace, namespaceClaims] of Object.entries(namespaces)) {
    for (const [claimKey, value] of Object.entries(namespaceClaims)) {
      if (claimKey.startsWith('_') || isHiddenClaimKey(claimKey) || claimKey === 'doctype') continue
      if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        if (MDOC_PHOTO_CLAIM_KEYS.has(claimKey)) {
          claims[`${namespace}.${claimKey}`] = readBinaryClaimValue(value)
        }
        continue
      }
      if (!hasClaimValue(value)) continue

      claims[`${namespace}.${claimKey}`] = normalizeIssuerClaimValue(value)
    }
  }

  return claims
}

/** @deprecated Use {@link mapMdocNamespaceIssuerClaims} — kept for ISO-only call sites. */
export function mapIso18013NamespaceIssuerClaims(
  namespaces: ParsedMdocNamespaces,
): Record<string, unknown> {
  const isoClaims = namespaces[ISO_18013_NAMESPACE]
  if (!isoClaims) return {}
  return mapMdocNamespaceIssuerClaims({ [ISO_18013_NAMESPACE]: isoClaims })
}

export function extractMdocIssuerClaims(
  mdocBytes: Uint8Array,
  decode?: (input: Uint8Array) => unknown,
): Record<string, unknown> {
  const decoder = decode ?? decodeMdocCbor
  try {
    const parsed = parseMdocDocument(mdocBytes, decoder)
    return mapMdocNamespaceIssuerClaims(parsed.namespaces)
  } catch (error) {
    logWalletError('oid4vci', 'mdoc-issuer-claims-extract-failed', error)
    return {}
  }
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

export function readMdocPhotoClaimValue(mdocBytes: Uint8Array): unknown {
  try {
    const parsed = parseMdocDocument(mdocBytes, decodeMdocCbor)
    for (const namespaceClaims of Object.values(parsed.namespaces)) {
      for (const key of MDOC_PHOTO_CLAIM_KEYS) {
        const value = namespaceClaims[key]
        if (hasClaimValue(value)) return value
      }
    }
  } catch (error) {
    logWalletError('oid4vci', 'mdoc-portrait-extract-failed', error)
  }
  return undefined
}

export function overlayDrivingLicenceMdocClaims(
  record: VerifiableCredentialRecord,
  mdocRawBase64: string,
): VerifiableCredentialRecord {
  if (record.type !== 'DLTDrivingLicence' || !mdocRawBase64) return record
  if (!shouldRemapDrivingLicenceMdocClaims(record)) return record

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

function shouldRemapDrivingLicenceMdocClaims(record: VerifiableCredentialRecord): boolean {
  const issuerUrl = record.issuerUrl?.trim()
  if (issuerUrl) return isFirstPartyIssuerOrigin(issuerUrl)
  return resolveFirstPartyType(record) === 'DLTDrivingLicence'
}

function normalizeIssuerClaimValue(value: unknown): unknown {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? value : String(value)
  }
  return value
}

function readBinaryClaimValue(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return undefined
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

/** Holder-facing display for ISO mDL driving_privileges arrays/objects. */
export function readDrivingPrivilegeDisplayValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatDrivingPrivilegeEntry(entry))
      .filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join('; ') : undefined
  }

  return formatDrivingPrivilegeEntry(value)
}

function formatDrivingPrivilegeEntry(entry: unknown): string | undefined {
  const code = readVehicleCategoryCode(entry)
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return code
  }

  const record = entry as Record<string, unknown>
  const issueDate = readIsoDateClaimValue(record.issue_date ?? record.issueDate)
  const expiryDate = readIsoDateClaimValue(record.expiry_date ?? record.expiryDate)
  const parts: string[] = []

  if (code) parts.push(code)
  if (issueDate) parts.push(`Issue ${issueDate}`)
  if (expiryDate) parts.push(`Expiry ${expiryDate}`)

  return parts.length > 0 ? parts.join(' · ') : undefined
}

function collectVehicleCategoryCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectVehicleCategoryCodes(entry))
  }

  const code = readVehicleCategoryCode(value)
  return code ? [code] : []
}

export function isDrivingPrivilegeShape(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((entry) => isDrivingPrivilegeShape(entry))
  }

  const code = readVehicleCategoryCode(value)
  if (code) return true
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  return 'vehicle_category_code' in record || 'vehicleCategoryCode' in record
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
