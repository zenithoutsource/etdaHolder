import { DUAL_FORMAT_ISSUE_SKEW_MS } from '@/src/config/dualFormatPolicy'
import { readRecord, readString } from '@/src/utils/jwtUtils'

import type {
  ConsistencyStatus,
  CredentialFormatRecord,
  LogicalCredential,
} from './logicalCredentialTypes'

export type ConsistencyValidationInput = {
  issuer: string
  documentType: string
  subjectId?: string
  documentId?: string
  sdJwt?: CredentialFormatRecord
  mdoc?: CredentialFormatRecord
}

export function deriveLogicalCredentialId(input: {
  issuerProvidedId?: string
  issuer: string
  documentType: string
  subjectId?: string
  documentId?: string
  sdJwtRecordId?: string
}): string {
  if (input.issuerProvidedId) return input.issuerProvidedId

  const derivedParts = [
    input.issuer,
    input.documentType,
    input.subjectId,
    input.documentId,
  ].filter((part): part is string => Boolean(part && part.length > 0))

  if (derivedParts.length >= 2) {
    return derivedParts.join(':')
  }

  if (input.sdJwtRecordId) return input.sdJwtRecordId

  throw new Error('LogicalCredentialIdUnavailable: stable linkage identifiers are missing')
}

export function validateCrossFormatConsistency(
  input: ConsistencyValidationInput,
): Pick<LogicalCredential, 'consistencyStatus' | 'warnings'> {
  const warnings: string[] = []

  if (!input.sdJwt || !input.mdoc) {
    return { consistencyStatus: 'verified', warnings }
  }

  const sdFamily = readConfigurationFamily(input.sdJwt.credentialConfigurationId)
  const mdocFamily = readConfigurationFamily(input.mdoc.credentialConfigurationId)

  if (sdFamily && mdocFamily && sdFamily !== mdocFamily) {
    return {
      consistencyStatus: 'mismatch',
      warnings: ['configuration family mismatch between dc+sd-jwt and mso_mdoc'],
    }
  }

  if (input.sdJwt.issuedAt && input.mdoc.issuedAt) {
    const skewMs = Math.abs(
      Date.parse(input.sdJwt.issuedAt) - Date.parse(input.mdoc.issuedAt),
    )
    if (skewMs > DUAL_FORMAT_ISSUE_SKEW_MS) {
      warnings.push(`issued-at skew ${skewMs}ms exceeds configured threshold`)
    }
  }

  if (
    input.sdJwt.expiresAt &&
    input.mdoc.expiresAt &&
    input.sdJwt.expiresAt !== input.mdoc.expiresAt
  ) {
    warnings.push('expiry timestamps differ between formats')
  }

  if (warnings.length > 0) {
    return { consistencyStatus: 'warning', warnings }
  }

  return { consistencyStatus: 'verified', warnings }
}

function readConfigurationFamily(configurationId: string): string | undefined {
  const normalized = configurationId.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalized
    .replace(/dcsdjwt$/, '')
    .replace(/vcsdjwt$/, '')
    .replace(/msomdoc$/, '') || undefined
}

export function readSubjectIdFromClaims(claims: Record<string, unknown>): string | undefined {
  return (
    readString(claims.subject_id) ??
    readString(claims.student_id) ??
    readString(claims.document_number) ??
    readString(claims.national_id)
  )
}

export function readDocumentIdFromClaims(claims: Record<string, unknown>): string | undefined {
  return (
    readString(claims.document_id) ??
    readString(claims.transcript_id) ??
    readString(claims.document_number)
  )
}

export function buildLogicalCredential(input: {
  logicalCredentialId: string
  issuer: string
  documentType: string
  subjectId?: string
  documentId?: string
  formats: LogicalCredential['formats']
}): LogicalCredential {
  const consistency = validateCrossFormatConsistency({
    issuer: input.issuer,
    documentType: input.documentType,
    subjectId: input.subjectId,
    documentId: input.documentId,
    sdJwt: input.formats['dc+sd-jwt'],
    mdoc: input.formats['mso_mdoc'],
  })

  return {
    logicalCredentialId: input.logicalCredentialId,
    issuer: input.issuer,
    documentType: input.documentType,
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    ...(input.documentId ? { documentId: input.documentId } : {}),
    formats: input.formats,
    consistencyStatus: consistency.consistencyStatus,
    warnings: consistency.warnings,
  }
}
