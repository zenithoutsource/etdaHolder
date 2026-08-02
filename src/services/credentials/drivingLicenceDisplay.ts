import { getCardSchema } from '../../config/cardSchemas'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { readCredentialClaimMap } from '../vci/exchangeService'
import {
  readCredentialDetailDisplay,
  readCredentialHolderProfile,
  readDisplayValue,
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

function formatThaiCredentialDate(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
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

export function readDrivingLicenceCardView(record: VerifiableCredentialRecord): DrivingLicenceCardView {
  const schema = getCardSchema('DLTDrivingLicence')
  const claims = readCredentialClaimMap(record)
  const enrichedRecord = { ...record, claims }
  const profile = readCredentialHolderProfile(enrichedRecord)
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

  const englishName =
    profile.englishName && profile.englishName !== profile.thaiName
      ? profile.englishName
      : EMPTY_VALUE

  return {
    documentTitle: schema.documentTitle,
    thaiName: profile.thaiName ?? EMPTY_VALUE,
    englishName,
    birthDate: formatThaiCredentialDate(birthDateRaw) ?? birthDateRaw ?? EMPTY_VALUE,
    type: licenceClass ?? EMPTY_VALUE,
    englishType: licenceClass ?? EMPTY_VALUE,
    licenceNumber: licenceNumber ?? EMPTY_VALUE,
    issueDate: formatThaiCredentialDate(issueDateRaw) ?? issueDateRaw ?? EMPTY_VALUE,
    expiryDate: formatThaiCredentialDate(expiryDateRaw) ?? expiryDateRaw ?? EMPTY_VALUE,
  }
}
