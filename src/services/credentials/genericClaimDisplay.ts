/**
 * Generic claim rows for unregistered credentials (issuer keys, metadata labels).
 */

import { isRecord } from '@/src/utils/jwtUtils'
import { isCborTaggedDateValue, readIsoDateClaimValue } from '@/src/utils/cborClaimValue'
import { readByteArray, readImageDataUriFromBytes } from '@/src/utils/imageDataUri'
import { hasClaimValue, isHiddenClaimKey } from './claimFormatting'
import { isDrivingPrivilegeShape, readDrivingPrivilegeDisplayValue } from './mdocWalletClaims'

export type GenericClaimRow = {
  key: string
  label: string
  value: string
}

const PHOTO_KEY_PATTERN = /^(portrait|photo|image)$/i
const IMAGE_DATA_URI_PATTERN = /^data:image\//i
const IMAGE_URL_PATTERN = /^https?:\/\/.+/i
const JPEG_BASE64_PREFIX = '/9j/'
const PNG_BASE64_PREFIX = 'iVBOR'

export function humanizeClaimKey(key: string): string {
  const lastSegment = key.includes('.') ? (key.split('.').at(-1) ?? key) : key
  return lastSegment
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function isPhotoClaimKey(key: string): boolean {
  const leaf = key.includes('.') ? (key.split('.').at(-1) ?? key) : key
  return PHOTO_KEY_PATTERN.test(leaf)
}

export function formatGenericClaimValue(value: unknown): string {
  if (isCborTaggedDateValue(value)) {
    return readIsoDateClaimValue(value) ?? ''
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value)
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    const privilegeDisplay = readDrivingPrivilegeDisplayValue(value)
    if (privilegeDisplay && isDrivingPrivilegeShape(value)) return privilegeDisplay
    return summarizeArray(value)
  }
  if (isRecord(value)) {
    const privilegeDisplay = readDrivingPrivilegeDisplayValue(value)
    if (privilegeDisplay && isDrivingPrivilegeShape(value)) return privilegeDisplay
    return summarizeObject(value)
  }
  return ''
}

function summarizeArray(value: unknown[]): string {
  return value
    .map((item) => {
      if (typeof item === 'boolean') return item ? 'Yes' : 'No'
      if (typeof item === 'string' || typeof item === 'number') return String(item)
      if (isRecord(item)) return summarizeObject(item)
      return ''
    })
    .filter((item) => item.length > 0)
    .join(', ')
}

function summarizeObject(value: Record<string, unknown>): string {
  if (isCborTaggedDateValue(value)) {
    return readIsoDateClaimValue(value) ?? ''
  }

  return Object.entries(value)
    .filter(([, entry]) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
    .map(([key, entry]) => `${humanizeClaimKey(key)}: ${formatGenericClaimValue(entry)}`)
    .join(', ')
}

function isCborEncodingKey(key: string): boolean {
  return key === 'tag' || key === '__tag' || key === 'value'
}

export function readImageUriFromClaim(value: unknown): string | undefined {
  const bytes = readByteArray(value)
  if (bytes) return readImageDataUriFromBytes(bytes)

  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  const trimmed = value.trim()
  if (IMAGE_DATA_URI_PATTERN.test(trimmed)) return trimmed
  if (trimmed.startsWith(JPEG_BASE64_PREFIX) || trimmed.startsWith(PNG_BASE64_PREFIX)) {
    const mime = trimmed.startsWith(PNG_BASE64_PREFIX) ? 'image/png' : 'image/jpeg'
    return `data:${mime};base64,${trimmed}`
  }
  if (IMAGE_URL_PATTERN.test(trimmed)) return trimmed
  return undefined
}

export function readGenericClaimRows(
  claims: Record<string, unknown>,
  labels: Record<string, string> = {},
  options?: { metadataKeyOrder?: readonly string[] },
): { rows: GenericClaimRow[]; photoUri?: string } {
  const rows: GenericClaimRow[] = []
  let photoUri: string | undefined

  for (const [key, value] of Object.entries(claims)) {
    if (key.startsWith('_') || isHiddenClaimKey(key) || !hasClaimValue(value)) continue

    if (isPhotoClaimKey(key)) {
      photoUri = photoUri ?? readImageUriFromClaim(value)
      continue
    }

    if (isRecord(value) && !Array.isArray(value)) {
      if (isCborTaggedDateValue(value)) {
        const taggedDate = formatGenericClaimValue(value).trim()
        if (taggedDate) {
          rows.push({
            key,
            label: labels[key] ?? humanizeClaimKey(key),
            value: taggedDate,
          })
        }
        continue
      }

      const nestedEntries = Object.entries(value).filter(
        ([nestedKey, nested]) => hasClaimValue(nested) && !isCborEncodingKey(nestedKey),
      )
      if (nestedEntries.length > 0) {
        for (const [nestedKey, nestedValue] of nestedEntries) {
          const nestedPath = `${key}.${nestedKey}`
          if (isPhotoClaimKey(nestedKey)) {
            photoUri = photoUri ?? readImageUriFromClaim(nestedValue)
            continue
          }
          const nestedText = formatGenericClaimValue(nestedValue).trim()
          if (!nestedText) continue
          rows.push({
            key: nestedPath,
            label: labels[nestedPath] ?? labels[nestedKey] ?? `${humanizeClaimKey(key)} ${humanizeClaimKey(nestedKey)}`,
            value: nestedText,
          })
        }
        continue
      }
    }

    const text = formatGenericClaimValue(value).trim()
    if (!text) continue
    rows.push({
      key,
      label: labels[key] ?? humanizeClaimKey(key),
      value: text,
    })
  }

  sortGenericClaimRows(rows, options?.metadataKeyOrder)
  return photoUri ? { rows, photoUri } : { rows }
}

function sortGenericClaimRows(rows: GenericClaimRow[], metadataKeyOrder?: readonly string[]): void {
  if (!metadataKeyOrder || metadataKeyOrder.length === 0) {
    rows.sort((left, right) => left.key.localeCompare(right.key))
    return
  }

  const rank = new Map<string, number>()
  metadataKeyOrder.forEach((key, index) => {
    rank.set(key, index)
    const leaf = key.includes('.') ? (key.split('.').at(-1) ?? key) : key
    if (!rank.has(leaf)) rank.set(leaf, index)
  })

  rows.sort((left, right) => {
    const leftRank = rank.get(left.key)
    const rightRank = rank.get(right.key)
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank
    if (leftRank !== undefined) return -1
    if (rightRank !== undefined) return 1
    return left.key.localeCompare(right.key)
  })
}
