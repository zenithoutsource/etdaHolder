import { MOCK_HOLDER_ENGLISH_NAME } from '../../config/drivingLicenceSample'
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
import { readDrivingPrivilegeLabel } from './mdocWalletClaims'

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
const DMY_DATE_PREFIX = /^(\d{2})\/(\d{2})\/(\d{4})$/
const ISO_VEHICLE_CATEGORY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\s*,\s*[A-Za-z][A-Za-z0-9]*)*$/

function toGregorianDate(value: string): Date | undefined {
  const trimmed = value.trim()
  const isoMatch = ISO_DATE_PREFIX.exec(trimmed)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const gregorianYear =
      year >= BUDDHIST_ERA_YEAR_THRESHOLD ? year - BUDDHIST_ERA_OFFSET : year
    const date = new Date(gregorianYear, month - 1, day)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const dmyMatch = DMY_DATE_PREFIX.exec(trimmed)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    let year = Number(dmyMatch[3])
    if (year >= BUDDHIST_ERA_YEAR_THRESHOLD) {
      year -= BUDDHIST_ERA_OFFSET
    }
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
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
    thaiName: ownProfile.thaiName ?? holderProfile?.thaiName,
    birthDate: ownProfile.birthDate ?? holderProfile?.birthDate,
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
    readDrivingPrivilegeLabel(claims.licenceClass) ??
    readDrivingPrivilegeLabel(claims.driving_privileges) ??
    readDrivingPrivilegeLabel(claims['org.iso.18013.5.1.driving_privileges']) ??
    readFieldValue(claims, 'licenceClass', [
      'licence_class',
      'licenseClass',
      'license_class',
      'license_type',
      'licence_type',
      'licenseType',
      'licenceType',
      'vehicle_category_code',
      'vehicleCategoryCode',
    ])
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
  const englishName = ownProfile.englishName?.trim() || MOCK_HOLDER_ENGLISH_NAME

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
