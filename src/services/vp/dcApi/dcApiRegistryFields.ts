/**
 * Builds Credential Manager registry fields from stored mdoc bytes.
 */
import { decode as decodeCbor } from 'cbor-x'

import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'
import {
  ensureNativeMdocStored,
  isMdocRawVc,
  readMdocBytesFromRawVc,
  readMdocDocTypeFromRecord,
} from '@/src/services/proximity/mdocCredential'
import { parseMdocDocument } from '@/src/services/proximity/mdocParser'
import { readStoredMdocBytes } from '@/src/services/proximity/mdocStorage'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

export const DC_API_MDL_DOCTYPE = 'org.iso.18013.5.1.mDL'
export const ISO_18013_MDL_NAMESPACE = 'org.iso.18013.5.1'

const DC_API_DERIVED_AGE_OVER_MAX_THRESHOLD_DEFAULT = 99

export type DcApiRegistryField = {
  namespace: string
  identifier: string
  fieldValue: string | number | boolean | null
}

export function readDcApiDerivedAgeOverMaxThreshold(): number {
  const configured = Number(process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX)
  if (!Number.isFinite(configured) || configured < 1) {
    return DC_API_DERIVED_AGE_OVER_MAX_THRESHOLD_DEFAULT
  }
  return Math.min(Math.trunc(configured), 120)
}

export function isDcApiMdocCredential(record: VerifiableCredentialRecord): boolean {
  return readMdocDocTypeFromRecord(record) === DC_API_MDL_DOCTYPE
}

export async function buildDcApiRegistryFields(
  record: VerifiableCredentialRecord,
): Promise<DcApiRegistryField[]> {
  await ensureNativeMdocStored(record)
  const mdocBytes = await readMdocBytesForRecord(record)
  const parsed = parseMdocDocument(mdocBytes, decodeCbor)
  const isoClaims = parsed.namespaces[ISO_18013_MDL_NAMESPACE] ?? {}

  const fields = Object.entries(isoClaims)
    .map(([identifier, value]) => ({
      namespace: ISO_18013_MDL_NAMESPACE,
      identifier,
      fieldValue:
        identifier === 'portrait' && isBinaryRegistryValue(value)
          ? null
          : serializeRegistryFieldValue(value),
    }))
    .filter((field): field is DcApiRegistryField => isDcApiRegistryMatchField(field))

  return filterDcApiRegistryFieldsForMatcher(
    appendDerivedAgeOverRegistryFields(fields, isoClaims),
  )
}

/** Keeps every scalar ISO claim the matcher can compare; drops binary/complex values. */
export function filterDcApiRegistryFieldsForMatcher(fields: DcApiRegistryField[]): DcApiRegistryField[] {
  return fields.filter((field) => isDcApiRegistryMatchField(field))
}

export function isDcApiRegistryMatchField(field: DcApiRegistryField): boolean {
  if (field.identifier === 'portrait') return true
  if (field.fieldValue === null) return false
  if (typeof field.fieldValue === 'string' && field.fieldValue.startsWith('__b64__:')) {
    return false
  }
  return true
}

export function appendDerivedAgeOverRegistryFields(
  fields: DcApiRegistryField[],
  isoClaims: Record<string, unknown>,
  referenceDate: Date = new Date(),
  maxThresholdYears: number = readDcApiDerivedAgeOverMaxThreshold(),
): DcApiRegistryField[] {
  const birthDateFromField = fields.find((field) => field.identifier === 'birth_date')?.fieldValue
  const birthDate =
    typeof birthDateFromField === 'string'
      ? birthDateFromField
      : serializeBirthDateValue(isoClaims.birth_date)
  if (!birthDate) {
    return fields
  }

  const derivedFields = [...fields]
  const cappedMaxThreshold = Math.max(1, Math.trunc(maxThresholdYears))
  for (let thresholdYears = 1; thresholdYears <= cappedMaxThreshold; thresholdYears += 1) {
    const identifier = `age_over_${thresholdYears}`
    if (derivedFields.some((field) => field.identifier === identifier)) {
      continue
    }

    const isOverThreshold = isAgeEqualOrOverFromIsoDate(birthDate, thresholdYears, referenceDate)
    if (isOverThreshold === null) {
      continue
    }

    derivedFields.push({
      namespace: ISO_18013_MDL_NAMESPACE,
      identifier,
      fieldValue: isOverThreshold,
    })
  }

  return derivedFields
}

function isAgeEqualOrOverFromIsoDate(
  birthDate: string,
  thresholdYears: number,
  referenceDate: Date,
): boolean | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  let age = referenceDate.getFullYear() - year
  const referenceMonth = referenceDate.getMonth() + 1
  const referenceDay = referenceDate.getDate()
  if (referenceMonth < month || (referenceMonth === month && referenceDay < day)) {
    age -= 1
  }

  return age >= thresholdYears
}

async function readMdocBytesForRecord(record: VerifiableCredentialRecord): Promise<Uint8Array> {
  if (isMdocRawVc(record.rawVc)) {
    return readMdocBytesFromRawVc(record.rawVc)
  }
  return readStoredMdocBytes(record.id)
}

function serializeRegistryFieldValue(value: unknown): string | number | boolean | null {
  const birthDate = serializeBirthDateValue(value)
  if (birthDate) return birthDate

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Uint8Array) {
    return `__b64__:${base64UrlEncodeBytes(value)}`
  }
  if (ArrayBuffer.isView(value)) {
    return `__b64__:${base64UrlEncodeBytes(Uint8Array.from(value))}`
  }
  return null
}

function serializeBirthDateValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    return match?.[1] ?? null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const taggedValue = readCborTaggedValue(value)
  if (taggedValue !== undefined) {
    return serializeBirthDateValue(taggedValue)
  }

  return null
}

function readCborTaggedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const tag = value.get('tag')
    if (typeof tag === 'number') return value.get('value')
    return undefined
  }

  if (typeof value === 'object' && value !== null && 'tag' in value && 'value' in value) {
    const tag = (value as { tag?: unknown }).tag
    if (typeof tag === 'number') return (value as { value?: unknown }).value
  }

  return undefined
}

function isBinaryRegistryValue(value: unknown): boolean {
  return value instanceof Uint8Array || ArrayBuffer.isView(value)
}
