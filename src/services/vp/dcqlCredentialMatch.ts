import { resolveCardSchema, findDisplayFieldForClaimKey, collectDisplayFieldMatchKeys } from '../../config/cardSchemas'
import { resolveFirstPartyType } from '../../config/firstPartyCredential'
import { readComposedPersonName } from '../credentials/credentialDisplay'
import { hasAnyClaimValue } from '../credentials/claimFormatting'
import { isMdocPresentableRecord, isMdocRawVc, readMdocDocTypeFromRecord } from '../proximity/mdocCredential'
import { readCredentialClaimMap } from '../vci/exchangeService'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { normalizeClaimKey } from '@/src/utils/claimKeyNormalization'
import { isCompactJwtVc, isCompactSdJwt, readCredentialVct } from './credentialFormatUtils'
import { isExactDualFormatPair, isMsoMdocDcqlFormat, isSdJwtDcqlFormat } from './dualFormatQuery'
import type { DcqlClaimsQuery, DcqlCredentialQuery, DcqlQuery } from './presentationService'

export { isCompactJwtVc, isCompactSdJwt, readCredentialVct } from './credentialFormatUtils'

const THAI_ID_TYPE = 'ThaiNationalID'
const TRANSCRIPT_TYPE = 'ChulalongkornUniversityTranscript'
const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'

function isSupportedDcqlFormat(format: string): boolean {
  return format === 'jwt_vc_json' || format === 'jwt_vc' || isSdJwtDcqlFormat(format) || isMsoMdocDcqlFormat(format)
}

export function readCredentialTypeFromDcqlTypeValue(value: string): string | undefined {
  const normalized = normalizeCredentialType(value)
  if (normalized.includes('idcard') || normalized.includes('nationalid')) return THAI_ID_TYPE
  if (normalized.includes('transcript')) return TRANSCRIPT_TYPE
  if (normalized.includes('drivinglicence') || normalized.includes('drivinglicense') || normalized.includes('dlt') || normalized.includes('mdl')) {
    return DRIVING_LICENCE_TYPE
  }
  return undefined
}

export function assertSupportedDcqlCredentialQuery(credential: DcqlCredentialQuery): void {
  if (!credential.format || credential.format.length === 0) {
    throw new Error('PresentationRequestInvalid: dcql credential format is required')
  }

  if (!isSupportedDcqlFormat(credential.format)) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential format is not supported')
  }

  const isMdocQuery = isMsoMdocDcqlFormat(credential.format)
  for (const claim of credential.claims ?? []) {
    if (claim.path.length > (isMdocQuery ? 2 : 1)) {
      throw new Error('PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1')
    }
  }

  if (isMdocQuery) {
    const doctypeValue = credential.meta?.doctype_value
    const typeValues = credential.meta?.type_values ?? []
    if (!doctypeValue && typeValues.length === 0) {
      throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
    }
    return
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

  if (!isSdJwtDcqlFormat(credential.format)) {
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
  if (isMsoMdocDcqlFormat(credential.format)) {
    return isStoredMdocCompatibleWithDcqlQuery(record, credential)
  }

  const typeValues = credential.meta?.type_values ?? []
  if (typeValues.length > 0) {
    const typeMatches = typeValues.some((value) => {
      const requestedType = readCredentialTypeFromDcqlTypeValue(value)
      return Boolean(requestedType) && resolveFirstPartyType(record) === requestedType
    })
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

function findUnsatisfiedDcqlClaimKeys(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): string[] {
  const claims = credential.claims ?? []
  if (claims.length === 0) return []

  const claimMap = readCredentialClaimMap(record)
  const schema = resolveCardSchema(record)

  const isClaimSatisfied = (claimQuery: DcqlClaimsQuery): boolean => {
    const requestedKey = claimQuery.path[0]
    if (!requestedKey) return false

    const field = findDisplayFieldForClaimKey(schema.displayFields, requestedKey)
    const lookupKeys = field ? collectDisplayFieldMatchKeys(field) : [requestedKey]

    if (hasAnyClaimValue(claimMap, lookupKeys)) return true
    if (field && normalizeClaimKey(field.key) === 'fullname') {
      return Boolean(readComposedPersonName(claimMap))
    }
    return false
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
  recordFormat: 'sd-jwt' | 'jwt_vc' | 'mso_mdoc' | 'unknown'
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
  const requestedTypeValues = credential.meta?.type_values ?? []
  const requestedVctValues = credential.meta?.vct_values ?? []
  const base = {
    recordType: record.type,
    recordFormat: readRecordCredentialFormat(record),
    recordVct: readCredentialVct(record),
    requestedFormat: credential.format,
    requestedTypeValues,
    requestedVctValues,
    recordClaimKeys: Object.keys(readCredentialClaimMap(record)),
  }

  if (isMsoMdocDcqlFormat(credential.format)) {
    if (!isMdocPresentableRecord(record)) {
      return { ...base, failedGate: 'format' }
    }
    if (!isStoredMdocCompatibleWithDcqlQuery(record, credential)) {
      return { ...base, failedGate: 'type' }
    }
    return { ...base, failedGate: 'none' }
  }

  if (
    requestedTypeValues.length > 0 &&
    !requestedTypeValues.some((value) => {
      const requestedType = readCredentialTypeFromDcqlTypeValue(value)
      return Boolean(requestedType) && resolveFirstPartyType(record) === requestedType
    })
  ) {
    return { ...base, failedGate: 'type' }
  }

  if (requestedVctValues.length > 0 && !isCredentialCompatibleWithDcqlMetadata(record, credential)) {
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

function readRecordCredentialFormat(
  record: VerifiableCredentialRecord,
): DcqlMatchFailure['recordFormat'] {
  if (isMdocPresentableRecord(record)) return 'mso_mdoc'
  const rawVc = record.rawVc
  if (isMdocRawVc(rawVc)) return 'mso_mdoc'
  if (isCompactSdJwt(rawVc)) return 'sd-jwt'
  if (isCompactJwtVc(rawVc)) return 'jwt_vc'
  return 'unknown'
}

export function isCredentialCompatibleWithDcqlFormat(
  record: VerifiableCredentialRecord,
  format: string | undefined,
): boolean {
  if (!format) return false
  if (isMsoMdocDcqlFormat(format)) return isMdocPresentableRecord(record)
  if (format === 'jwt_vc_json' || format === 'jwt_vc') return isCompactJwtVc(record.rawVc)
  if (isSdJwtDcqlFormat(format)) return isCompactSdJwt(record.rawVc)
  return false
}

export function isCredentialCompatibleWithDcqlMetadata(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const requestedVctValues = credential.meta?.vct_values ?? []
  if (requestedVctValues.length === 0) return true

  const credentialVct = readCredentialVct(record)
  return Boolean(
    credentialVct && requestedVctValues.some((requested) => areVctValuesEquivalent(requested, credentialVct)),
  )
}

function isStoredMdocCompatibleWithDcqlQuery(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const storedDoctype = readStoredMdocDoctype(record)
  if (!storedDoctype) return false

  const requestedDoctypes = readRequestedMdocDoctypes(credential)
  return requestedDoctypes.includes(storedDoctype)
}

function readRequestedMdocDoctypes(credential: DcqlCredentialQuery): string[] {
  return [
    ...(credential.meta?.doctype_value ? [credential.meta.doctype_value] : []),
    ...(credential.meta?.type_values ?? []),
  ]
}

function readStoredMdocDoctype(record: VerifiableCredentialRecord): string | undefined {
  if (!isMdocPresentableRecord(record)) return undefined
  return readMdocDocTypeFromRecord(record)
}

/**
 * Treats issuer VCT URLs as equivalent when they share the same origin and path
 * prefix and map to the same wallet credential type, including the common
 * DrivingLicense / DrivingLicence spelling mismatch between verifier and issuer.
 */
export function areVctValuesEquivalent(requested: string, stored: string): boolean {
  if (requested === stored) return true

  const requestedKey = buildVctEquivalenceKey(requested)
  const storedKey = buildVctEquivalenceKey(stored)
  return Boolean(requestedKey && storedKey && requestedKey === storedKey)
}

function normalizeCredentialType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeVctTypeSegment(segment: string): string {
  return normalizeCredentialType(segment).replace(/license/g, 'licence')
}

function buildVctEquivalenceKey(vct: string): string | undefined {
  try {
    const url = new URL(vct)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length === 0) return undefined

    const typeSegment = segments[segments.length - 1]!
    if (!readCredentialTypeFromDcqlTypeValue(typeSegment)) return undefined

    segments[segments.length - 1] = normalizeVctTypeSegment(typeSegment)
    return `${url.origin}/${segments.join('/')}`
  } catch {
    if (!readCredentialTypeFromDcqlTypeValue(vct)) return undefined
    return normalizeVctTypeSegment(vct)
  }
}
