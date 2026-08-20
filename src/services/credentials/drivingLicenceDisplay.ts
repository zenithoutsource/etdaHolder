import { getCardSchema } from '../../config/cardSchemas'
import { resolveDrivingLicenceVehicleType } from '../../config/drivingLicenceVehicleCategories'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { readCredentialClaimMap } from '../vci/exchangeService'
import {
  readCredentialDetailDisplay,
  readCredentialHolderProfile,
  readDisplayValue,
  type CredentialHolderProfile,
} from './credentialDisplay'

export type DrivingLicenceCardView = Readonly<{
  documentTitle: string
  thaiName: string
  englishName: string
  birthDate: string
  type: string
  englishType: string
  licenceNumber: string
  issueDate: string
  expiryDate: string
}>

const EMPTY_VALUE = '-'
const BUDDHIST_ERA_YEAR_THRESHOLD = 2400
const BUDDHIST_ERA_OFFSET = 543
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/
const ISO_VEHICLE_CATEGORY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\s*,\s*[A-Za-z][A-Za-z0-9]*)*$/

function toGregorianDate(value: string): Date | undefined {
  const match = ISO_DATE_PREFIX.exec(value)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const gregorianYear =
    year >= BUDDHIST_ERA_YEAR_THRESHOLD ? year - BUDDHIST_ERA_OFFSET : year
  const date = new Date(gregorianYear, month - 1, day)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatThaiCredentialDate(value?: string): string | undefined {
  if (!value) return undefined
  const date = toGregorianDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function readFieldValue(
  claims: Record<string, unknown>,
  key: string,
  aliases: readonly string[] = [],
): string | undefined {
  return readDisplayValue(claims, { key, label: key, aliases: [...aliases] })
}

export function readDrivingLicenceCardView(
  record: VerifiableCredentialRecord,
  holderProfile?: CredentialHolderProfile,
): DrivingLicenceCardView {
  const schema = getCardSchema('DLTDrivingLicence')
  const claims = readCredentialClaimMap(record)
  const enrichedRecord = { ...record, claims }
  const ownProfile = readCredentialHolderProfile(enrichedRecord)
  const profile: CredentialHolderProfile = {
    ...ownProfile,
    ...holderProfile,
  }
  const display = readCredentialDetailDisplay(enrichedRecord)

  const birthDateRaw =
    profile.birthDate ??
    readFieldValue(claims, 'birthDate', [
      'birthdate',
      'birth_date',
      'dateOfBirth',
      'date_of_birth',
      'dob',
    ])
  const licenceClass =
    readFieldValue(claims, 'licenceClass', [
      'licence_class',
      'licenseClass',
      'license_class',
      'vehicle_category_code',
      'vehicleCategoryCode',
    ]) ?? display.primaryRows.find((row) => row.key === 'licenceClass')?.value
  const licenceNumber =
    readFieldValue(claims, 'licenceNumber', [
      'licence_number',
      'licenseNumber',
      'license_number',
      'document_number',
      'documentNumber',
    ]) ?? display.primaryRows.find((row) => row.key === 'licenceNumber')?.value
  const issueDateRaw =
    readFieldValue(claims, 'issuanceDate', ['issued', 'issueDate', 'issue_date']) ??
    record.issuedAt
  const expiryDateRaw =
    readFieldValue(claims, 'expiryDate', ['expiry_date', 'expirationDate']) ?? record.expiresAt

  const vehicleType = readVehicleTypeLabels(licenceClass)
  const englishName =
    readLatinEnglishName(claims, profile.englishName, profile.thaiName) ?? EMPTY_VALUE

  return {
    documentTitle: schema.documentTitle,
    thaiName: profile.thaiName ?? EMPTY_VALUE,
    englishName,
    birthDate: formatThaiCredentialDate(birthDateRaw) ?? birthDateRaw ?? EMPTY_VALUE,
    type: vehicleType.type,
    englishType: vehicleType.englishType,
    licenceNumber: licenceNumber ?? EMPTY_VALUE,
    issueDate: formatThaiCredentialDate(issueDateRaw) ?? issueDateRaw ?? EMPTY_VALUE,
    expiryDate: formatThaiCredentialDate(expiryDateRaw) ?? expiryDateRaw ?? EMPTY_VALUE,
  }
}

function readVehicleTypeLabels(licenceClass?: string): { type: string; englishType: string } {
  const resolved = resolveDrivingLicenceVehicleType(licenceClass)
  if (resolved) {
    return { type: resolved.thai, englishType: resolved.english }
  }

  if (!licenceClass || ISO_VEHICLE_CATEGORY_PATTERN.test(licenceClass.trim())) {
    return { type: EMPTY_VALUE, englishType: EMPTY_VALUE }
  }

  return { type: licenceClass, englishType: EMPTY_VALUE }
}

function readLatinEnglishName(
  claims: Record<string, unknown>,
  profileEnglishName?: string,
  thaiName?: string,
): string | undefined {
  if (isLatinName(profileEnglishName) && profileEnglishName !== thaiName) {
    return profileEnglishName
  }

  const composed = [
    readFieldValue(claims, 'givenNameEn', [
      'given_name_en',
      'englishGivenName',
      'firstNameEn',
      'first_name_en',
    ]),
    readFieldValue(claims, 'familyNameEn', [
      'family_name_en',
      'englishFamilyName',
      'lastNameEn',
      'last_name_en',
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  return isLatinName(composed) ? composed : undefined
}

function isLatinName(value?: string): value is string {
  return Boolean(value && /[A-Za-z]/.test(value) && !/[\u0E00-\u0E7F]/.test(value))
}
