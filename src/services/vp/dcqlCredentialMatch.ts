import { getCardSchema } from '../../config/cardSchemas'
import { readClaimText } from '../credentials/claimFormatting'
import { decodeJwtPayload, isRecord, readString } from '@/src/utils/jwtUtils'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isExactDualFormatPair } from './dualFormatPresentationMatch'
import type { DcqlClaimsQuery, DcqlCredentialQuery, DcqlQuery } from './presentationService'

const THAI_ID_TYPE = 'ThaiNationalID'
const TRANSCRIPT_TYPE = 'BangkokUniversityTranscript'
const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'

const SUPPORTED_DCQL_FORMATS = new Set(['jwt_vc_json', 'jwt_vc', 'dc+sd-jwt', 'vc+sd-jwt'])

export function readCredentialTypeFromDcqlTypeValue(value: string): string | undefined {
  const normalized = normalizeCredentialType(value)
  if (normalized.includes('idcard') || normalized.includes('nationalid')) return THAI_ID_TYPE
  if (normalized.includes('transcript')) return TRANSCRIPT_TYPE
  if (normalized.includes('drivinglicence') || normalized.includes('drivinglicense') || normalized.includes('dlt')) {
    return DRIVING_LICENCE_TYPE
  }
  return undefined
}

export function assertSupportedDcqlCredentialQuery(credential: DcqlCredentialQuery): void {
  if (!credential.format || credential.format.length === 0) {
    throw new Error('PresentationRequestInvalid: dcql credential format is required')
  }

  if (!SUPPORTED_DCQL_FORMATS.has(credential.format)) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential format is not supported')
  }

  for (const claim of credential.claims ?? []) {
    if (claim.path.length > 1) {
      throw new Error('PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1')
    }
  }

  const typeValues = credential.meta?.type_values ?? []
  const vctValues = credential.meta?.vct_values ?? []
  if (typeValues.length === 0 && vctValues.length === 0) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }

  if (typeValues.length > 0) {
    if (!typeValues.some((value) => readCredentialTypeFromDcqlTypeValue(value))) {
      throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
    }
    return
  }

  if (credential.format !== 'dc+sd-jwt' && credential.format !== 'vc+sd-jwt') {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }
}

export function assertSupportedDcqlRequest(query: DcqlQuery): void {
  if (isExactDualFormatPair(query)) return

  for (const credential of query.credentials) {
    assertSupportedDcqlCredentialQuery(credential)
  }
}

export function assertNoSetDcqlCardinality(query: DcqlQuery): void {
  if (isExactDualFormatPair(query)) return
  if (query.credentials.length > 1) {
    throw new Error('PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1')
  }
}

export function canWalletSatisfyDcqlCredentialQuery(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const typeValues = credential.meta?.type_values ?? []
  if (typeValues.length > 0) {
    const typeMatches = typeValues.some((value) => record.type === readCredentialTypeFromDcqlTypeValue(value))
    if (!typeMatches) return false
  }

  const vctValues = credential.meta?.vct_values ?? []
  if (vctValues.length > 0 && !isCredentialCompatibleWithDcqlMetadata(record, credential)) {
    return false
  }

  if (!isCredentialCompatibleWithDcqlFormat(record, credential.format)) {
    return false
  }

  return findUnsatisfiedDcqlClaimKeys(record, credential).length === 0
}

export function findUnsatisfiedDcqlClaimKeys(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): string[] {
  const claims = credential.claims ?? []
  if (claims.length === 0) return []

  const isClaimSatisfied = (claimQuery: DcqlClaimsQuery): boolean => {
    const requestedKey = claimQuery.path[0]
    if (!requestedKey) return false

    const schema = getCardSchema(record.type)
    const normalizedClaimKeys = new Map(Object.keys(record.claims).map((key) => [normalizeClaimKey(key), key]))
    const normalizedRequestedKey = normalizeClaimKey(requestedKey)
    const matchedKey = normalizedClaimKeys.get(normalizedRequestedKey)
    if (!matchedKey) return false

    const value = readClaimText(record.claims, [matchedKey])
    if (value === undefined) return false

    const field = schema.displayFields.find(
      (displayField) =>
        normalizeClaimKey(displayField.key) === normalizedRequestedKey ||
        (displayField.aliases ?? []).some((alias) => normalizeClaimKey(alias) === normalizedRequestedKey),
    )

    return Boolean(field ?? matchedKey)
  }

  const claimKey = (claimQuery: DcqlClaimsQuery): string => claimQuery.path[0] ?? '(empty path)'

  // With claim_sets the verifier accepts any one group of claim ids; the query
  // is satisfiable when a single group is fully satisfiable. Without claim_sets
  // every listed claim is mandatory.
  const claimSets = credential.claimSets ?? []
  if (claimSets.length > 0) {
    const claimsById = new Map(claims.filter((claim) => claim.id).map((claim) => [claim.id as string, claim]))
    const groupResults = claimSets.map((group) =>
      group
        .map((id) => claimsById.get(id))
        .filter((claim): claim is DcqlClaimsQuery => Boolean(claim))
        .filter((claim) => !isClaimSatisfied(claim))
        .map(claimKey),
    )
    if (groupResults.some((unsatisfied) => unsatisfied.length === 0)) return []
    return groupResults.reduce((best, current) => (current.length < best.length ? current : best))
  }

  return claims.filter((claimQuery) => !isClaimSatisfied(claimQuery)).map(claimKey)
}

export type DcqlMatchFailure = {
  recordType: string
  recordFormat: 'sd-jwt' | 'jwt_vc' | 'unknown'
  recordVct?: string
  requestedFormat?: string
  requestedTypeValues: string[]
  requestedVctValues: string[]
  failedGate: 'type' | 'vct' | 'format' | 'claims' | 'none'
  unsatisfiedClaimKeys?: string[]
  recordClaimKeys: string[]
}

/**
 * Mirrors the gate order of canWalletSatisfyDcqlCredentialQuery and reports
 * which gate rejected the record, so match failures are diagnosable from the
 * wallet log. Contains only type metadata — no claim values, no raw VC.
 */
export function describeDcqlMatchFailure(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): DcqlMatchFailure {
  const base = {
    recordType: record.type,
    recordFormat: isCompactSdJwt(record.rawVc) ? ('sd-jwt' as const) : isCompactJwtVc(record.rawVc) ? ('jwt_vc' as const) : ('unknown' as const),
    recordVct: readCredentialVct(record),
    requestedFormat: credential.format,
    requestedTypeValues: credential.meta?.type_values ?? [],
    requestedVctValues: credential.meta?.vct_values ?? [],
    recordClaimKeys: Object.keys(record.claims),
  }

  const typeValues = credential.meta?.type_values ?? []
  if (typeValues.length > 0 && !typeValues.some((value) => record.type === readCredentialTypeFromDcqlTypeValue(value))) {
    return { ...base, failedGate: 'type' }
  }

  const vctValues = credential.meta?.vct_values ?? []
  if (vctValues.length > 0 && !isCredentialCompatibleWithDcqlMetadata(record, credential)) {
    return { ...base, failedGate: 'vct' }
  }

  if (!isCredentialCompatibleWithDcqlFormat(record, credential.format)) {
    return { ...base, failedGate: 'format' }
  }

  const unsatisfiedClaimKeys = findUnsatisfiedDcqlClaimKeys(record, credential)
  if (unsatisfiedClaimKeys.length > 0) {
    return { ...base, failedGate: 'claims', unsatisfiedClaimKeys }
  }

  return { ...base, failedGate: 'none' }
}

export function isCredentialCompatibleWithDcqlFormat(
  record: VerifiableCredentialRecord,
  format: string | undefined,
): boolean {
  if (!format) return false
  if (format === 'jwt_vc_json' || format === 'jwt_vc') return isCompactJwtVc(record.rawVc)
  if (format === 'dc+sd-jwt' || format === 'vc+sd-jwt') return isCompactSdJwt(record.rawVc)
  return false
}

export function isCredentialCompatibleWithDcqlMetadata(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const requestedVctValues = credential.meta?.vct_values ?? []
  if (requestedVctValues.length === 0) return true

  const credentialVct = readCredentialVct(record)
  return Boolean(credentialVct && requestedVctValues.includes(credentialVct))
}

function readCredentialVct(record: VerifiableCredentialRecord): string | undefined {
  const claimVct = readString(record.claims.vct)
  if (claimVct) return claimVct

  const issuerJwt = record.rawVc.split('~')[0] ?? record.rawVc
  return readString(decodeJwtPayload(issuerJwt)?.vct)
}

function isCompactJwtVc(rawVc: string): boolean {
  if (isCompactSdJwt(rawVc)) return false
  const payload = decodeJwtPayload(rawVc)
  return isRecord(payload?.vc)
}

function isCompactSdJwt(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
}

function normalizeClaimKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeCredentialType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9]/g, '')
}
