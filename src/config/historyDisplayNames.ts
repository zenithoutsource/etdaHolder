import { getCardSchema } from './cardSchemas'
import {
  readPresentationAccessLabel,
  readPresentationVerifierDisplayName,
} from './presentationVerifierMocks'
import { WALLET_HISTORY_COPY, WALLET_HISTORY_PARTY_PLACEHOLDERS } from './walletHistoryCopy'

const GENERIC_ISSUER_NAMES = new Set([
  'unknown issuer',
  'licensed medical practitioner',
  'department of provincial administration',
  'department of land transport',
  'chulalongkorn university',
])

const KNOWN_CREDENTIAL_TYPES = [
  'ThaiNationalID',
  'DLTDrivingLicence',
  'ChulalongkornUniversityTranscript',
  'MedicalCertificate',
] as const

function normalizeDisplayName(value?: string): string {
  return value?.trim() ?? ''
}

export function isGenericIssuerName(name?: string): boolean {
  const trimmed = normalizeDisplayName(name)
  if (!trimmed) return true
  return GENERIC_ISSUER_NAMES.has(trimmed.toLowerCase())
}

export function isGenericDocumentTitle(name?: string, credentialType?: string): boolean {
  const trimmed = normalizeDisplayName(name)
  if (!trimmed) return true
  if (credentialType) {
    const schema = getCardSchema(credentialType)
    if (schema.type !== '__fallback__' && schema.title === trimmed) return true
  }
  const knownTitles = new Set(
    ['Credential', 'Thai National ID', 'Driving Licence', 'Academic Transcript', 'Medical Certificate'].map(
      (title) => title.toLowerCase(),
    ),
  )
  return knownTitles.has(trimmed.toLowerCase())
}

export function readHistoryDocumentLabel(input: {
  credentialType: string
  /** Display name from Issuer offer / configuration — wins even when English (grill #11). */
  offerDisplayName?: string
  /** Previously stored documentType on a history row. */
  storedDocumentType?: string
}): string {
  const offerName = normalizeDisplayName(input.offerDisplayName)
  if (offerName) return offerName

  const schema = getCardSchema(input.credentialType)
  const stored = normalizeDisplayName(input.storedDocumentType)
  if (stored && !isGenericDocumentTitle(stored, input.credentialType)) {
    return stored
  }

  const documentLabel = schema.issuanceConfirmation?.documentLabel?.trim()
  if (documentLabel) return documentLabel

  if (input.credentialType === 'MedicalCertificate') return 'ใบรับรองแพทย์'

  return schema.title
}

export function readHistoryIssuerPartyName(input: {
  credentialType: string
  /** Name from Issuer offer / record — used when not generic. */
  protocolIssuerName?: string
}): string {
  const protocolName = normalizeDisplayName(input.protocolIssuerName)
  if (protocolName && !isGenericIssuerName(protocolName)) {
    return protocolName
  }

  const schema = getCardSchema(input.credentialType)
  const issuerLabel = schema.issuanceConfirmation?.issuerLabel?.trim()
  if (issuerLabel) return issuerLabel

  if (input.credentialType === 'MedicalCertificate') return 'โรงพยาบาล'

  return WALLET_HISTORY_COPY.partyFallbackIssuer
}

export function projectHistoryPartyName(input: {
  partyName: string
  kind: string
  channel?: string
  credentialType?: string
}): string {
  const placeholder = WALLET_HISTORY_PARTY_PLACEHOLDERS[input.partyName]
  if (placeholder) return placeholder

  const isPresentation =
    input.kind.startsWith('presentation-') || input.kind.startsWith('nfc-')

  if (isPresentation && input.channel !== 'nfc') {
    return readPresentationVerifierDisplayName(input.credentialType ?? '', input.partyName)
  }

  if (
    input.kind === 'credential-received'
    || input.kind === 'credential-verify-failed'
    || input.kind === 'credential-revoked'
    || input.kind === 'credential-deleted'
    || input.kind === 'credential-used'
    || input.kind === 'credential-renewal-completed'
  ) {
    return readHistoryIssuerPartyName({
      credentialType: input.credentialType ?? '',
      protocolIssuerName: input.partyName,
    })
  }

  return input.partyName
}

export function projectHistoryDocumentType(input: {
  documentType: string
  credentialType?: string
}): string {
  const credentialType =
    input.credentialType ?? inferCredentialTypeFromDocumentType(input.documentType)

  if (!credentialType) return input.documentType

  return readHistoryDocumentLabel({
    credentialType,
    storedDocumentType: input.documentType,
  })
}

export function projectHistoryInfoBoxValue(input: {
  kind: string
  disclosedClaims: string[]
  documentType: string
  credentialType?: string
}): string {
  const isPresentation = input.kind.startsWith('presentation-') || input.kind.startsWith('nfc-')
  const claimsText = input.disclosedClaims.join(', ')
  const projectedDocument = projectHistoryDocumentType({
    documentType: input.documentType,
    credentialType: input.credentialType,
  })

  if (isPresentation) {
    if (claimsText) return claimsText
    const credentialType =
      input.credentialType ?? inferCredentialTypeFromDocumentType(input.documentType)
    if (credentialType) {
      const mockAccess = readPresentationAccessLabel(credentialType)
      if (mockAccess) return mockAccess
    }
    return projectedDocument
  }

  return projectedDocument
}

/** Resolve credentialType for projection when older rows omitted it. */
export function inferCredentialTypeFromDocumentType(documentType: string): string | undefined {
  for (const type of KNOWN_CREDENTIAL_TYPES) {
    const schema = getCardSchema(type)
    if (
      schema.title === documentType
      || schema.issuanceConfirmation?.documentLabel === documentType
    ) {
      return type
    }
  }
  return undefined
}
