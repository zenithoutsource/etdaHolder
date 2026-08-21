import { resolveCardSchema, type CardSchemaConfig, type DisplayField, collectDisplayFieldMatchKeys } from '../../config/cardSchemas'
import { isFirstPartyCredential } from '../../config/firstPartyCredential'
import { normalizeClaimKey, readMdocElementIdentifier } from '@/src/utils/claimKeyNormalization'
import { readCredentialClaimMap, type VerifiableCredentialRecord } from '../vci/exchangeService'
import { hasAnyClaimValue, isHiddenClaimKey, readClaimText, stringifyClaim } from './claimFormatting'
import { readGenericClaimRows } from './genericClaimDisplay'
import { readCredentialIssuerName } from './credentialIssuer'

const PID_CREDENTIAL_TYPE = 'ThaiNationalID'
const LATIN_NAME_PATTERN = /[A-Za-z]/
const THAI_SCRIPT_PATTERN = /[\u0E00-\u0E7F]/
const ENGLISH_GIVEN_NAME_KEYS = [
  'givenNameEn',
  'given_name_en',
  'englishGivenName',
  'firstNameEn',
  'first_name_en',
] as const
const ENGLISH_FAMILY_NAME_KEYS = [
  'familyNameEn',
  'family_name_en',
  'englishFamilyName',
  'lastNameEn',
  'last_name_en',
] as const

export type CredentialDisplayRow = {
  key: string
  label: string
  value: string
}

export type CredentialSummaryDisplay = {
  title: string
  documentTitle: string
  issuerName: string
  primaryColor: string
  imageKey: CardSchemaConfig['imageKey']
  primaryText: string
  rows: CredentialDisplayRow[]
}

export type CredentialDetailDisplay = CredentialSummaryDisplay & {
  primaryRows: CredentialDisplayRow[]
  extraRows: CredentialDisplayRow[]
  issuedAt: string
  expiresAt?: string
  photoUri?: string
}

export type CredentialHolderProfile = {
  thaiName?: string
  englishName?: string
  birthDate?: string
}

export type PidMdocNameOverlay = {
  given_name?: string
  family_name?: string
}

export function readCredentialSummaryDisplay(record: VerifiableCredentialRecord): CredentialSummaryDisplay {
  const schema = resolveCardSchema(record)
  const holderName = readHolderName(record)
  const firstParty = isFirstPartyCredential(record)
  const claimMap = firstParty ? record.claims : readCredentialClaimMap(record)
  const generic = firstParty ? undefined : readGenericClaimRows(claimMap, record.claimDisplayLabels)
  const title = firstParty
    ? schema.title
    : (record.credentialDisplayName?.trim() || schema.title)
  const issuerName = firstParty ? schema.issuerName : readCredentialIssuerName(record)

  return {
    title,
    documentTitle: schema.documentTitle,
    issuerName,
    primaryColor: schema.primaryColor,
    imageKey: schema.imageKey,
    primaryText: holderName || title,
    rows: firstParty
      ? readRows(record.claims, schema.summaryFields ?? schema.displayFields)
      : (generic?.rows.slice(0, 3) ?? []),
  }
}

export function readCredentialDetailDisplay(record: VerifiableCredentialRecord): CredentialDetailDisplay {
  const summary = readCredentialSummaryDisplay(record)
  const schema = resolveCardSchema(record)

  if (!isFirstPartyCredential(record)) {
    const generic = readGenericClaimRows(readCredentialClaimMap(record), record.claimDisplayLabels)
    return {
      ...summary,
      primaryRows: generic.rows,
      extraRows: [],
      issuedAt: record.issuedAt,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
      ...(generic.photoUri ? { photoUri: generic.photoUri } : {}),
    }
  }

  const primaryRows = readRows(record.claims, schema.displayFields)
  const configuredKeys = new Set(schema.displayFields.flatMap((field) => [field.key, ...(field.aliases ?? [])]))
  const extraRows = Object.entries(record.claims)
    .filter(([key, value]) => {
      if (configuredKeys.has(key) || key.startsWith('_') || isHiddenClaimKey(key)) return false
      return stringifyClaim(value).trim().length > 0
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, label: key, value: stringifyClaim(value) }))

  return { ...summary, primaryRows, extraRows, issuedAt: record.issuedAt, ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}) }
}

export function readCredentialHolderProfile(record: VerifiableCredentialRecord): CredentialHolderProfile {
  const genericFullName = readFirstClaimTextLoose(record.claims, ['fullName', 'full_name', 'name'])
  const explicitThaiName = readFirstClaimTextLoose(record.claims, [
    'thaiFullName',
    'thai_full_name',
    'fullNameTh',
    'full_name_th',
    'fullNameThai',
    'nameTh',
    'name_th',
    'thaiName',
    'nameThai',
    'ชื่อนามสกุล',
    'ชื่อ-นามสกุล',
  ]) ?? (genericFullName && THAI_SCRIPT_PATTERN.test(genericFullName) ? genericFullName : undefined)
  const thaiNameParts = [
    readFirstClaimTextLoose(record.claims, ['givenNameTh', 'given_name_th', 'givenNameThai', 'thaiGivenName', 'thai_given_name', 'firstNameTh', 'first_name_th', 'ชื่อ']),
    readFirstClaimTextLoose(record.claims, ['familyNameTh', 'family_name_th', 'familyNameThai', 'thaiFamilyName', 'thai_family_name', 'lastNameTh', 'last_name_th', 'นามสกุล']),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  const thaiName = explicitThaiName ?? (thaiNameParts || pickNameByScript(record.claims, 'thai'))
  const composedEnglishName = [
    readFirstClaimTextLoose(record.claims, [...ENGLISH_GIVEN_NAME_KEYS]),
    readFirstClaimTextLoose(record.claims, [...ENGLISH_FAMILY_NAME_KEYS]),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  const englishName = readLatinDisplayName(
    readFirstClaimTextLoose(record.claims, [
      'englishFullName',
      'english_full_name',
      'fullNameEn',
      'full_name_en',
      'fullNameEnglish',
      'nameEn',
      'name_en',
      'englishName',
      'nameEnglish',
    ]) ??
      (composedEnglishName || undefined) ??
      (isLatinDisplayName(genericFullName) ? genericFullName : undefined) ??
      pickNameByScript(record.claims, 'latin'),
  )
  const birthDate = readFirstClaimTextLoose(record.claims, [
    'birthDate',
    'birthdate',
    'birth_date',
    'dateOfBirth',
    'date_of_birth',
    'dob',
    'dateOfBirthBE',
    'date_of_birth_be',
    'วันเกิด',
    'วันเดือนปีเกิด',
  ])

  return {
    ...(thaiName ? { thaiName } : {}),
    ...(englishName ? { englishName } : {}),
    ...(birthDate ? { birthDate } : {}),
  }
}

export function resolveDisplayHolderProfile(
  record: VerifiableCredentialRecord,
  credentials: readonly VerifiableCredentialRecord[] = [],
): CredentialHolderProfile {
  const own = readCredentialHolderProfile(record)
  if (record.type === PID_CREDENTIAL_TYPE) return own

  const pidMatches = credentials.filter((entry) => entry.type === PID_CREDENTIAL_TYPE)
  const pid = pickPidForDisplay(pidMatches)
  if (!pid) return own

  const pidProfile = readCredentialHolderProfile(pid)
  return {
    ...(own.thaiName || pidProfile.thaiName ? { thaiName: own.thaiName ?? pidProfile.thaiName } : {}),
    ...(own.englishName || pidProfile.englishName
      ? { englishName: own.englishName ?? pidProfile.englishName }
      : {}),
    ...(own.birthDate || pidProfile.birthDate ? { birthDate: own.birthDate ?? pidProfile.birthDate } : {}),
  }
}

/**
 * ISO mDL given_name/family_name for NFC DeviceResponse display.
 * Session overlay only for fields the presenting document is missing.
 */
export function resolvePidMdocNameOverlay(
  record: VerifiableCredentialRecord,
  credentials: readonly VerifiableCredentialRecord[] = [],
): PidMdocNameOverlay | undefined {
  if (record.type === PID_CREDENTIAL_TYPE) return undefined

  const own = readIsoGivenAndFamily(record)
  if (own.given_name && own.family_name) return undefined

  const pid = pickPidForDisplay(credentials.filter((entry) => entry.type === PID_CREDENTIAL_TYPE))
  if (!pid) return undefined

  const pidParts = readPidGivenAndFamily(pid)
  const overlay: PidMdocNameOverlay = {
    ...(!own.given_name && pidParts.given_name ? { given_name: pidParts.given_name } : {}),
    ...(!own.family_name && pidParts.family_name ? { family_name: pidParts.family_name } : {}),
  }
  if (!overlay.given_name && !overlay.family_name) return undefined
  return overlay
}

function readPidGivenAndFamily(pid: VerifiableCredentialRecord): PidMdocNameOverlay {
  const given = readThaiNamePart(pid.claims, [
    'givenNameTh',
    'given_name_th',
    'givenNameThai',
    'thaiGivenName',
    'thai_given_name',
    'firstNameTh',
    'first_name_th',
    'ชื่อ',
    'givenName',
    'given_name',
    'firstName',
    'first_name',
  ])
  const family = readThaiNamePart(pid.claims, [
    'familyNameTh',
    'family_name_th',
    'familyNameThai',
    'thaiFamilyName',
    'thai_family_name',
    'lastNameTh',
    'last_name_th',
    'นามสกุล',
    'familyName',
    'family_name',
    'lastName',
    'last_name',
  ])
  if (given && family) return { given_name: given, family_name: family }
  const thaiName = readCredentialHolderProfile(pid).thaiName
  return thaiName ? splitThaiGivenAndFamily(thaiName) ?? {} : {}
}

function readIsoGivenAndFamily(record: VerifiableCredentialRecord): PidMdocNameOverlay {
  const given = readFirstClaimTextLoose(record.claims, [
    'givenName',
    'given_name',
    'firstName',
    'first_name',
    'givenNameTh',
    'given_name_th',
    'firstNameTh',
    'first_name_th',
    'ชื่อ',
  ])
  const family = readFirstClaimTextLoose(record.claims, [
    'familyName',
    'family_name',
    'lastName',
    'last_name',
    'familyNameTh',
    'family_name_th',
    'lastNameTh',
    'last_name_th',
    'นามสกุล',
  ])
  return {
    ...(given ? { given_name: given } : {}),
    ...(family ? { family_name: family } : {}),
  }
}

export function splitThaiGivenAndFamily(fullName: string): PidMdocNameOverlay | undefined {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return undefined
  if (parts.length === 1) return { given_name: parts[0] }

  const familyName = parts[parts.length - 1]
  const givenName = parts.slice(0, -1).join(' ')
  if (!givenName || !familyName) return undefined
  return { given_name: givenName, family_name: familyName }
}

const FULL_NAME_DISCLOSURE_KEYS = new Set([
  'fullname',
  'name',
  'thaifullname',
  'thainame',
  'studentname',
  'student_name',
])
const GIVEN_NAME_DISCLOSURE_KEYS = new Set(['givenname', 'firstname', 'ชื่อ'])
const FAMILY_NAME_DISCLOSURE_KEYS = new Set(['familyname', 'lastname', 'นามสกุล'])
const ENGLISH_NAME_DISCLOSURE_KEYS = new Set([
  'englishname',
  'englishfullname',
  'fullnameen',
  'nameen',
])

/**
 * Holder-facing presentment disclosure values: issuer value first, PID only when missing.
 * VP wire stays unchanged.
 */
export function overlayPresentationDisclosureValue(
  claimKey: string,
  currentValue: string | undefined,
  profile?: CredentialHolderProfile,
): string | undefined {
  const identifier = normalizeClaimKey(readMdocElementIdentifier(claimKey))
  const pidParts = profile?.thaiName ? splitThaiGivenAndFamily(profile.thaiName) : undefined

  if (ENGLISH_NAME_DISCLOSURE_KEYS.has(identifier)) {
    if (isLatinDisplayName(currentValue)) return currentValue
    return profile?.englishName || '-'
  }
  if (hasDisplayText(currentValue)) return currentValue
  if (!profile) return currentValue

  if (FULL_NAME_DISCLOSURE_KEYS.has(identifier)) {
    return profile.thaiName ?? currentValue
  }
  if (GIVEN_NAME_DISCLOSURE_KEYS.has(identifier)) {
    return pidParts?.given_name ?? currentValue
  }
  if (FAMILY_NAME_DISCLOSURE_KEYS.has(identifier)) {
    return pidParts?.family_name ?? currentValue
  }
  return currentValue
}

function hasDisplayText(value?: string): value is string {
  return Boolean(value && value.trim().length > 0)
}

export function readDisplayValue(claims: Record<string, unknown>, field: DisplayField): string | undefined {
  return readClaimText(claims, [field.key, ...(field.aliases ?? [])])
}

export function readComposedPersonName(claims: Record<string, unknown>): string | undefined {
  const name = [
    readClaimText(claims, ['givenName', 'given_name', 'firstName', 'first_name']),
    readClaimText(claims, ['familyName', 'family_name', 'lastName', 'last_name']),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  return name || undefined
}

export function readPresentationFieldValue(
  claims: Record<string, unknown>,
  field: DisplayField,
): string | undefined {
  if (normalizeClaimKey(field.key) === 'fullname') {
    return readClaimText(claims, [field.key, ...(field.aliases ?? [])]) ?? readComposedPersonName(claims)
  }

  const text = readDisplayValue(claims, field)
  if (text) return text
  if (hasAnyClaimValue(claims, collectDisplayFieldMatchKeys(field))) return ''
  return undefined
}

export function readHolderName(record: VerifiableCredentialRecord): string {
  return readComposedPersonName(record.claims) ?? ''
}

function readRows(claims: Record<string, unknown>, fields: DisplayField[]): CredentialDisplayRow[] {
  return fields
    .map((field) => {
      const value = readDisplayValue(claims, field)
      return value ? { key: field.key, label: field.label, value } : undefined
    })
    .filter((row): row is CredentialDisplayRow => Boolean(row))
}

function readFirstClaimTextLoose(claims: Record<string, unknown>, keys: string[]): string | undefined {
  const normalizedKeys = new Map(
    Object.keys(claims).map((key) => [normalizeClaimKey(key), key])
  )

  for (const key of keys) {
    const matchedKey = normalizedKeys.get(normalizeClaimKey(key))
    if (!matchedKey) continue
    const text = stringifyClaim(claims[matchedKey]).trim()
    if (text.length > 0) return text
  }

  return undefined
}

function pickNameByScript(claims: Record<string, unknown>, script: 'thai' | 'latin'): string | undefined {
  const given = script === 'thai'
    ? readThaiNamePart(claims, ['givenName', 'given_name', 'firstName', 'first_name'])
    : readLatinNamePart(claims, ['givenName', 'given_name', 'firstName', 'first_name'])
  const family = script === 'thai'
    ? readThaiNamePart(claims, ['familyName', 'family_name', 'lastName', 'last_name'])
    : readLatinNamePart(claims, ['familyName', 'family_name', 'lastName', 'last_name'])
  const name = [given, family].filter(Boolean).join(' ').trim()
  return name || undefined
}

function readThaiNamePart(claims: Record<string, unknown>, keys: string[]): string | undefined {
  const text = readFirstClaimTextLoose(claims, keys)
  return text && THAI_SCRIPT_PATTERN.test(text) ? text : undefined
}

function readLatinNamePart(claims: Record<string, unknown>, keys: string[]): string | undefined {
  const text = readFirstClaimTextLoose(claims, keys)
  return isLatinDisplayName(text) ? text : undefined
}

function readLatinDisplayName(value?: string): string | undefined {
  return isLatinDisplayName(value) ? value : undefined
}

function isLatinDisplayName(value?: string): value is string {
  return Boolean(value && LATIN_NAME_PATTERN.test(value) && !THAI_SCRIPT_PATTERN.test(value))
}

function pickPidForDisplay(
  matches: readonly VerifiableCredentialRecord[],
): VerifiableCredentialRecord | undefined {
  if (matches.length === 0) return undefined
  const presentable = matches.filter((record) => !isPidExpiredForDisplay(record))
  return (presentable.length > 0 ? presentable : matches)[0]
}

function isPidExpiredForDisplay(record: VerifiableCredentialRecord): boolean {
  if (!record.expiresAt) return false
  const expiry = Date.parse(record.expiresAt)
  return !Number.isNaN(expiry) && expiry <= Date.now()
}
