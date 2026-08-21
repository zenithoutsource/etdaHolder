/**
 * Exact first-party credential allowlist and display-time reclassify.
 * Journey: Home catalog, credential detail, DLT NFC, issuance receive chrome.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

export const FIRST_PARTY_CREDENTIAL_TYPES = [
  'ThaiNationalID',
  'DLTDrivingLicence',
  'ChulalongkornUniversityTranscript',
  'MedicalCertificate',
] as const

export type FirstPartyCredentialType = (typeof FIRST_PARTY_CREDENTIAL_TYPES)[number]

export type FirstPartyRecordLike = {
  type: string
  claims?: Record<string, unknown>
  credentialConfigurationId?: string
  issuerUrl?: string
}

const FIRST_PARTY_TYPE_SET = new Set<string>(
  FIRST_PARTY_CREDENTIAL_TYPES.map((type) => type.toLowerCase()),
)

const WIRE_ID_TO_TYPE: Record<string, FirstPartyCredentialType> = {
  thainationalid: 'ThaiNationalID',
  idcard: 'ThaiNationalID',
  'idcard_dc+sd-jwt': 'ThaiNationalID',
  dltdrivinglicence: 'DLTDrivingLicence',
  drivinglicense: 'DLTDrivingLicence',
  drivinglicence: 'DLTDrivingLicence',
  iso18013driverslicensecredential: 'DLTDrivingLicence',
  'org.iso.18013.5.1.mdl': 'DLTDrivingLicence',
  chulalongkornuniversitytranscript: 'ChulalongkornUniversityTranscript',
  transcriptcredential: 'ChulalongkornUniversityTranscript',
  medicalcertificate: 'MedicalCertificate',
}

const FORMAT_SUFFIXES = ['_dc+sd-jwt', '_vc+sd-jwt', '_mso_mdoc', '_jwt_vc_json'] as const
const DEFAULT_FIRST_PARTY_ISSUER = 'https://issuer.zenithcomp.co.th:455'
const DEFAULT_FIRST_PARTY_ISSUER_HOSTNAME = 'issuer.zenithcomp.co.th'

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

function stripFormatSuffix(normalized: string): string | undefined {
  for (const suffix of FORMAT_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      return normalized.slice(0, -suffix.length)
    }
  }
  return undefined
}

function addIdentifierCandidate(candidates: Set<string>, value: string | undefined): void {
  if (!value) return
  candidates.add(value)
  const stripped = stripFormatSuffix(value)
  if (stripped) candidates.add(stripped)
}

function identifierCandidates(value: string): string[] {
  const normalized = normalizeIdentifier(value)
  if (!normalized) return []

  const candidates = new Set<string>()
  addIdentifierCandidate(candidates, normalized)
  addIdentifierCandidate(candidates, normalized.split('/').filter(Boolean).at(-1))

  try {
    if (normalized.includes('://')) {
      const pathLast = new URL(value.trim()).pathname.split('/').filter(Boolean).at(-1)
      addIdentifierCandidate(candidates, pathLast?.toLowerCase())
    }
  } catch {
    // Ignore unparseable URLs; exact and slash-segment candidates still apply.
  }

  return [...candidates]
}

export function canonicalFirstPartyType(identifier?: string): FirstPartyCredentialType | undefined {
  if (!identifier) return undefined

  for (const candidate of identifierCandidates(identifier)) {
    const mapped = WIRE_ID_TO_TYPE[candidate]
    if (mapped) return mapped
    if (FIRST_PARTY_TYPE_SET.has(candidate)) {
      return FIRST_PARTY_CREDENTIAL_TYPES.find((type) => type.toLowerCase() === candidate)
    }
  }

  return undefined
}

export function isFirstPartyIdentifier(identifier?: string): boolean {
  return Boolean(canonicalFirstPartyType(identifier))
}

function readHostname(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed?.includes('://')) return undefined
  try {
    const hostname = new URL(trimmed).hostname.toLowerCase()
    return hostname || undefined
  } catch {
    return undefined
  }
}

function readFirstPartyIssuerHostname(): string {
  const fromEnv = process.env.EXPO_PUBLIC_ISSUER_CREDENTIAL_ISSUER?.trim()
  return readHostname(fromEnv || DEFAULT_FIRST_PARTY_ISSUER) ?? DEFAULT_FIRST_PARTY_ISSUER_HOSTNAME
}

export function isFirstPartyIssuerOrigin(value?: string): boolean {
  const hostname = readHostname(value)
  return Boolean(hostname) && hostname === readFirstPartyIssuerHostname()
}

function readRecordIssuerHostnames(record: FirstPartyRecordLike): string[] {
  const claims = record.claims ?? {}
  const values = [record.issuerUrl, claims.iss, claims.vct]
  return values
    .map((value) => (typeof value === 'string' ? readHostname(value) : undefined))
    .filter((hostname): hostname is string => Boolean(hostname))
}

function readWireIdentifiers(record: FirstPartyRecordLike): string[] {
  const claims = record.claims ?? {}
  const identifiers = [claims.vct, claims.doctype, record.credentialConfigurationId]
  return identifiers.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function readCandidateFirstPartyType(record: FirstPartyRecordLike): FirstPartyCredentialType | undefined {
  const wireIds = readWireIdentifiers(record)
  const fromWire = wireIds.map((id) => canonicalFirstPartyType(id)).find(Boolean)
  if (fromWire) return fromWire
  if (wireIds.length > 0) return undefined
  return canonicalFirstPartyType(record.type)
}

export function resolveFirstPartyType(record: FirstPartyRecordLike): FirstPartyCredentialType | undefined {
  const candidate = readCandidateFirstPartyType(record)
  if (!candidate) return undefined

  const hostnames = readRecordIssuerHostnames(record)
  if (hostnames.length > 0 && !hostnames.includes(readFirstPartyIssuerHostname())) {
    return undefined
  }

  return candidate
}

export function isFirstPartyCredential(record: FirstPartyRecordLike): boolean {
  return Boolean(resolveFirstPartyType(record))
}

export function isFirstPartyDrivingLicence(record: FirstPartyRecordLike): boolean {
  return resolveFirstPartyType(record) === 'DLTDrivingLicence'
}

export function readUnregisteredDocumentGroupKey(record: FirstPartyRecordLike): string {
  const claims = record.claims ?? {}
  if (typeof claims.vct === 'string' && claims.vct.trim()) return claims.vct.trim()
  if (record.credentialConfigurationId?.trim()) return record.credentialConfigurationId.trim()
  if (typeof claims.doctype === 'string' && claims.doctype.trim()) return claims.doctype.trim()
  return record.type
}
