import type { CardSchemaConfig } from './cardSchemas'

/** Offline NFC sharing mode — vendor-agnostic. */
export type ReaderSharingMode = 'mdoc-only' | 'dual-format'

export type ReaderProfileField = {
  namespace: string
  identifier: string
}

export type ReaderProfileCompanion = {
  /** Registered companion transport plugin id (see companionTransport/registry). */
  transportPluginId: string
  sdJwtClaimKeys: string[]
}

export type ReaderProfile = {
  profileId: string
  /** Stable vendor key for grouping profiles (e.g. `etda`, `acme-corp`). */
  vendorId: string
  vendorDisplayName: string
  documentType: CardSchemaConfig['type']
  profileDisplayName: string
  sharingMode: ReaderSharingMode
  mdocFields: ReaderProfileField[]
  companion?: ReaderProfileCompanion
}

const TRANSCRIPT_MDOC_FIELDS: ReaderProfileField[] = [
  { namespace: 'th.go.etda.transcript', identifier: 'student_name' },
  { namespace: 'th.go.etda.transcript', identifier: 'student_id' },
  { namespace: 'th.go.etda.transcript', identifier: 'degree' },
  { namespace: 'th.go.etda.transcript', identifier: 'institution' },
  { namespace: 'th.go.etda.transcript', identifier: 'graduation_date' },
]

const TRANSCRIPT_COMPANION_CLAIMS = [
  'student_name',
  'student_id',
  'degree',
  'institution',
  'graduation_date',
]

/** Built-in reader profiles. Extend this registry for additional vendors. */
export const READER_PROFILES: ReaderProfile[] = [
  {
    profileId: 'etda-transcript-acr1311u-n2',
    vendorId: 'etda',
    vendorDisplayName: 'ETDA',
    documentType: 'BangkokUniversityTranscript',
    profileDisplayName: 'ETDA Transcript (ACR1311U-N2)',
    sharingMode: 'dual-format',
    mdocFields: TRANSCRIPT_MDOC_FIELDS,
    companion: {
      transportPluginId: 'etda-companion-v1',
      sdJwtClaimKeys: TRANSCRIPT_COMPANION_CLAIMS,
    },
  },
  {
    profileId: 'etda-transcript-mdoc-only',
    vendorId: 'etda',
    vendorDisplayName: 'ETDA',
    documentType: 'BangkokUniversityTranscript',
    profileDisplayName: 'ETDA Transcript mDOC-only',
    sharingMode: 'mdoc-only',
    mdocFields: TRANSCRIPT_MDOC_FIELDS,
  },
]

export function listReaderProfiles(): ReaderProfile[] {
  return [...READER_PROFILES]
}

export function getReaderProfileById(profileId: string): ReaderProfile | undefined {
  return READER_PROFILES.find((profile) => profile.profileId === profileId)
}

export function getReaderProfileForDocumentType(
  documentType: string,
  sharingMode: ReaderSharingMode = 'dual-format',
): ReaderProfile | undefined {
  return READER_PROFILES.find(
    (profile) => profile.documentType === documentType && profile.sharingMode === sharingMode,
  )
}

export function listReaderProfilesForVendor(vendorId: string): ReaderProfile[] {
  return READER_PROFILES.filter((profile) => profile.vendorId === vendorId)
}

export function listMdocFieldKeysFromProfile(profile: ReaderProfile): string[] {
  return profile.mdocFields.map((field) => `${field.namespace}.${field.identifier}`)
}

export function readerProfileUsesCompanion(profile: ReaderProfile): boolean {
  return profile.sharingMode === 'dual-format' && Boolean(profile.companion?.transportPluginId)
}
