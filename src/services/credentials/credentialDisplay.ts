import { getCardSchema, type CardSchemaConfig, type DisplayField } from '../../config/cardSchemas'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

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
}

export type CredentialHolderProfile = {
  thaiName?: string
  englishName?: string
  birthDate?: string
}

const HIDDEN_CLAIM_KEYS = new Set(['vc', 'iss', 'iat', 'nbf', 'exp', 'jti', 'vct', 'cnf', 'status'])

export function readCredentialSummaryDisplay(record: VerifiableCredentialRecord): CredentialSummaryDisplay {
  const schema = getCardSchema(record.type)
  const holderName = readHolderName(record)

  return {
    title: schema.title,
    documentTitle: schema.documentTitle,
    issuerName: schema.issuerName,
    primaryColor: schema.primaryColor,
    imageKey: schema.imageKey,
    primaryText: holderName || schema.title,
    rows: readRows(record.claims, schema.summaryFields ?? schema.displayFields),
  }
}

export function readCredentialDetailDisplay(record: VerifiableCredentialRecord): CredentialDetailDisplay {
  const summary = readCredentialSummaryDisplay(record)
  const schema = getCardSchema(record.type)
  const primaryRows = readRows(record.claims, schema.displayFields)
  const configuredKeys = new Set(schema.displayFields.flatMap((field) => [field.key, ...(field.aliases ?? [])]))
  const extraRows = Object.entries(record.claims)
    .filter(([key, value]) => {
      if (configuredKeys.has(key) || key.startsWith('_') || HIDDEN_CLAIM_KEYS.has(key)) return false
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
  ]) ?? (genericFullName && /[\u0E00-\u0E7F]/.test(genericFullName) ? genericFullName : undefined)
  const thaiNameParts = [
    readFirstClaimTextLoose(record.claims, ['givenNameTh', 'given_name_th', 'givenNameThai', 'thaiGivenName', 'thai_given_name', 'firstNameTh', 'first_name_th', 'ชื่อ']),
    readFirstClaimTextLoose(record.claims, ['familyNameTh', 'family_name_th', 'familyNameThai', 'thaiFamilyName', 'thai_family_name', 'lastNameTh', 'last_name_th', 'นามสกุล']),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  const thaiName = explicitThaiName ?? (thaiNameParts || pickNameByScript(record.claims, 'thai'))
  const englishName =
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
    (genericFullName && /[A-Za-z]/.test(genericFullName) && !/[\u0E00-\u0E7F]/.test(genericFullName) ? genericFullName : undefined) ??
    pickNameByScript(record.claims, 'latin') ??
    readHolderName(record)
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

export function readDisplayValue(claims: Record<string, unknown>, field: DisplayField): string | undefined {
  for (const key of [field.key, ...(field.aliases ?? [])]) {
    const text = stringifyClaim(claims[key]).trim()
    if (text.length > 0) return text
  }

  return undefined
}

export function readHolderName(record: VerifiableCredentialRecord): string {
  return [
    readFirstClaimText(record.claims, ['givenName', 'given_name', 'firstName', 'first_name']),
    readFirstClaimText(record.claims, ['familyName', 'family_name', 'lastName', 'last_name']),
  ]
    .filter(Boolean)
    .join(' ')
}

function readRows(claims: Record<string, unknown>, fields: DisplayField[]): CredentialDisplayRow[] {
  return fields
    .map((field) => {
      const value = readDisplayValue(claims, field)
      return value ? { key: field.key, label: field.label, value } : undefined
    })
    .filter((row): row is CredentialDisplayRow => Boolean(row))
}

function readFirstClaimText(claims: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = stringifyClaim(claims[key]).trim()
    if (text.length > 0) return text
  }

  return undefined
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
  return text && /[\u0E00-\u0E7F]/.test(text) ? text : undefined
}

function readLatinNamePart(claims: Record<string, unknown>, keys: string[]): string | undefined {
  const text = readFirstClaimTextLoose(claims, keys)
  return text && /[A-Za-z]/.test(text) && !/[\u0E00-\u0E7F]/.test(text) ? text : undefined
}

function normalizeClaimKey(key: string): string {
  return key.replace(/[\s_\-.]/g, '').toLowerCase()
}

function stringifyClaim(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}
