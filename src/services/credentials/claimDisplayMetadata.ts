/**
 * OID4VCI credential configuration display names persisted onto stored records.
 */

import { isRecord, readRecord } from '@/src/utils/jwtUtils'

export type ClaimDisplayLabels = Record<string, string>

function isPlaceholderDisplayName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return normalized.length === 0 || normalized === 'string' || normalized === 'text'
}

function localeRank(locale?: string): number {
  const normalized = locale?.trim().toLowerCase() ?? ''
  if (normalized.startsWith('th')) return 0
  if (normalized.startsWith('en')) return 1
  return 2
}

export function readClaimDisplayName(value: unknown): string | undefined {
  const display = readRecord(value)?.display
  if (!Array.isArray(display)) return undefined

  const named: Array<{ name: string; locale?: string }> = []
  for (const item of display) {
    const record = readRecord(item)
    const name = record?.name
    if (typeof name !== 'string' || isPlaceholderDisplayName(name)) continue
    named.push({
      name,
      locale: typeof record?.locale === 'string' ? record.locale : undefined,
    })
  }
  named.sort((left, right) => localeRank(left.locale) - localeRank(right.locale))

  return named[0]?.name
}

export function readCredentialDisplayName(
  display?: { name?: string },
  fallback?: string,
): string | undefined {
  const name = display?.name?.trim()
  if (name) return name
  const fallbackName = fallback?.trim()
  return fallbackName || undefined
}

export function readClaimDisplayLabels(rawConfiguration: unknown): ClaimDisplayLabels | undefined {
  const claims = readRecord(rawConfiguration)?.claims
  if (!isRecord(claims)) return undefined

  const labels: ClaimDisplayLabels = {}
  for (const [key, value] of Object.entries(claims)) {
    const name = readClaimDisplayName(value)
    if (name) labels[key] = name
  }

  return Object.keys(labels).length > 0 ? labels : undefined
}
