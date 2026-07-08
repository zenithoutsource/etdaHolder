import { getCardSchema } from '@/src/config/cardSchemas'
import { readDisplayValue } from '@/src/services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const DOCUMENT_EXPIRY_CLAIM_KEYS = [
  'expirationDate',
  'expiration_date',
  'expiryDate',
  'expiry_date',
  'validUntil',
  'valid_until',
] as const

const THAI_MONTH_TO_NUMBER: Record<string, number> = {
  มกราคม: 1,
  'ม.ค.': 1,
  มค: 1,
  กุมภาพันธ์: 2,
  'ก.พ.': 2,
  กพ: 2,
  มีนาคม: 3,
  'มี.ค.': 3,
  มีค: 3,
  เมษายน: 4,
  'เม.ย.': 4,
  เมย: 4,
  พฤษภาคม: 5,
  'พ.ค.': 5,
  พค: 5,
  มิถุนายน: 6,
  'มิ.ย.': 6,
  มิย: 6,
  กรกฎาคม: 7,
  'ก.ค.': 7,
  กค: 7,
  สิงหาคม: 8,
  'ส.ค.': 8,
  สค: 8,
  กันยายน: 9,
  'ก.ย.': 9,
  กย: 9,
  ตุลาคม: 10,
  'ต.ค.': 10,
  ตค: 10,
  พฤศจิกายน: 11,
  'พ.ย.': 11,
  พย: 11,
  ธันวาคม: 12,
  'ธ.ค.': 12,
  ธค: 12,
}

function readExpiryDisplayValue(
  claims: Record<string, unknown>,
  type: string,
): string | undefined {
  const schema = getCardSchema(type)
  const fields = [...schema.displayFields, ...(schema.summaryFields ?? [])]

  for (const field of fields) {
    const isExpiryField =
      field.key === 'expiryDate' ||
      field.aliases?.some((alias) => /expir|หมดอายุ|validuntil|valid_until/i.test(alias))

    if (!isExpiryField) continue

    const value = readDisplayValue(claims, field)?.trim()
    if (value) return value
  }

  return undefined
}

export function parseThaiBuddhistDate(value: string): string | undefined {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const match = normalized.match(/^(\d{1,2})\s+([^\s]+(?:\.[^\s]+)?)\s+(\d{4})$/u)
  if (!match) return undefined

  const day = Number(match[1])
  const month = THAI_MONTH_TO_NUMBER[match[2]]
  const buddhistYear = Number(match[3])
  if (!month || !Number.isInteger(day) || buddhistYear < 2400) return undefined

  const gregorianYear = buddhistYear - 543
  const calendarDate = `${gregorianYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const date = new Date(`${calendarDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return undefined

  return date.toISOString()
}

export function parseDocumentExpiryValue(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const isoDate = new Date(trimmed)
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.toISOString()
  }

  return parseThaiBuddhistDate(trimmed)
}

export function readDocumentExpiryFromClaims(
  claims: Record<string, unknown>,
): string | undefined {
  for (const key of DOCUMENT_EXPIRY_CLAIM_KEYS) {
    const value = claims[key]
    if (typeof value !== 'string') continue

    const parsed = parseDocumentExpiryValue(value)
    if (parsed) return parsed
  }

  return undefined
}

function readExpiryFromRecordClaims(
  claims: Record<string, unknown>,
  type?: string,
): string | undefined {
  if (type) {
    const displayValue = readExpiryDisplayValue(claims, type)
    if (displayValue) {
      const parsed = parseDocumentExpiryValue(displayValue)
      if (parsed) return parsed
    }
  }

  return readDocumentExpiryFromClaims(claims)
}

export function readNormalizedDocumentExpiry(input: {
  claims: Record<string, unknown>
  type?: string
  vcExpirationDate?: string
  jwtExp?: number
}): string | undefined {
  const fromClaims = readExpiryFromRecordClaims(input.claims, input.type)
  if (fromClaims) return fromClaims

  if (input.vcExpirationDate) {
    const parsed = parseDocumentExpiryValue(input.vcExpirationDate)
    if (parsed) return parsed
  }

  if (input.jwtExp !== undefined) {
    return new Date(input.jwtExp * 1000).toISOString()
  }

  return undefined
}

export function readCredentialDocumentExpiresAt(
  record: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>,
): string | undefined {
  return readExpiryFromRecordClaims(record.claims, record.type) ?? record.expiresAt
}
