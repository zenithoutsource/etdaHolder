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

  return { ...summary, primaryRows, extraRows }
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

function stringifyClaim(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}
