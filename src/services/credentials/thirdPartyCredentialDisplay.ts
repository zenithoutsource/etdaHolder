/**
 * Third-party credential display policy.
 *
 * Third-party / interop issuers (any origin outside the configured first-party issuer)
 * must NOT be remapped into first-party cardSchemas or DrivingLicenceDocumentCard chrome.
 *
 * Display contract:
 * - Labels: OID4VCI `credential_configuration.claims[].display` metadata, snapshotted onto the
 *   record as `claimDisplayLabels` at claim time (Thai locale preferred when present).
 * - Values: decoded issuer payloads (SD-JWT disclosures / JWT claims / mdoc namespace values)
 *   without wallet-side mdoc→wallet key remapping.
 * - Order: issuer metadata claim definition order from the claim-time snapshot.
 * - When claim-time labels exist, render exactly one row per metadata claim key (no alias duplicates).
 * - Metadata changes require re-claim; display does not fetch issuer metadata at view time.
 *
 * First-party credentials keep config-driven cardSchemas and dedicated document layouts.
 */

import { normalizeClaimKey, readMdocElementIdentifier } from '@/src/utils/claimKeyNormalization'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isFirstPartyCredential } from '../../config/firstPartyCredential'
import { readCredentialClaimMap } from '../vci/exchangeService'
import { hasClaimValue, isHiddenClaimKey } from './claimFormatting'
import {
  formatGenericClaimValue,
  isPhotoClaimKey,
  readGenericClaimRows,
  readImageUriFromClaim,
  type GenericClaimRow,
} from './genericClaimDisplay'

export function isThirdPartyCredentialRecord(record: VerifiableCredentialRecord): boolean {
  return !isFirstPartyCredential(record)
}

export function readThirdPartyCredentialClaimMap(
  record: VerifiableCredentialRecord,
): Record<string, unknown> {
  return readCredentialClaimMap(record)
}

export function readThirdPartyCredentialDisplayRows(
  record: VerifiableCredentialRecord,
): { rows: GenericClaimRow[]; photoUri?: string } {
  const labels = record.claimDisplayLabels ?? {}
  const metadataKeyOrder = Object.keys(labels)
  const claims = readThirdPartyCredentialClaimMap(record)

  if (metadataKeyOrder.length > 0) {
    const dedupedMetadataKeys = dedupeMetadataClaimKeys(metadataKeyOrder, claims)
    return readMetadataLabeledClaimRows(claims, labels, dedupedMetadataKeys)
  }

  return readGenericClaimRows(dedupeThirdPartyClaimsByLeaf(claims))
}

function readMetadataLabeledClaimRows(
  claims: Record<string, unknown>,
  labels: Record<string, string>,
  metadataKeyOrder: readonly string[],
): { rows: GenericClaimRow[]; photoUri?: string } {
  const rows: GenericClaimRow[] = []
  let photoUri: string | undefined

  for (const metadataKey of metadataKeyOrder) {
    if (isCborMetadataSubKey(metadataKey)) continue
    const label = labels[metadataKey]
    if (!label) continue

    const value = resolveClaimValueForMetadataKey(claims, metadataKey)
    if (!hasClaimValue(value)) continue

    if (isPhotoClaimKey(metadataKey) || isPhotoClaimKey(readMdocElementIdentifier(metadataKey))) {
      photoUri = photoUri ?? readImageUriFromClaim(value)
      continue
    }

    const text = formatGenericClaimValue(value).trim()
    if (!text) continue

    rows.push({
      key: metadataKey,
      label,
      value: text,
    })
  }

  return photoUri ? { rows, photoUri } : { rows }
}

function dedupeMetadataClaimKeys(
  metadataKeyOrder: readonly string[],
  claims: Record<string, unknown>,
): string[] {
  const keysByLeaf = new Map<string, string[]>()
  for (const key of metadataKeyOrder) {
    const leaf = readClaimLeafKey(key)
    const group = keysByLeaf.get(leaf) ?? []
    group.push(key)
    keysByLeaf.set(leaf, group)
  }

  const shadowedParents = new Set<string>()
  for (const key of metadataKeyOrder) {
    const prefix = `${key}.`
    if (metadataKeyOrder.some((other) => other !== key && other.startsWith(prefix))) {
      shadowedParents.add(key)
    }
  }

  const emittedLeaves = new Set<string>()
  const deduped: string[] = []
  for (const key of metadataKeyOrder) {
    if (isCborMetadataSubKey(key)) continue
    if (shadowedParents.has(key)) continue

    const leaf = readClaimLeafKey(key)
    if (emittedLeaves.has(leaf)) continue
    emittedLeaves.add(leaf)

    const candidates = keysByLeaf.get(leaf) ?? [key]
    deduped.push(pickPreferredMetadataKey(candidates, claims))
  }

  return deduped
}

function readClaimLeafKey(key: string): string {
  return normalizeClaimKey(readMdocElementIdentifier(key))
}

function isCborMetadataSubKey(key: string): boolean {
  const leaf = readClaimLeafKey(key)
  return leaf === 'tag' || leaf === '__tag' || leaf === 'value'
}

function pickPreferredMetadataKey(
  candidates: readonly string[],
  claims: Record<string, unknown>,
): string {
  const resolvable = candidates.filter((key) =>
    hasClaimValue(resolveClaimValueForMetadataKey(claims, key)),
  )
  const pool = resolvable.length > 0 ? resolvable : [...candidates]
  return pool.sort((left, right) => right.length - left.length)[0] ?? candidates[0] ?? ''
}

function resolveClaimValueForMetadataKey(
  claims: Record<string, unknown>,
  metadataKey: string,
): unknown {
  const direct = claims[metadataKey]
  if (hasClaimValue(direct)) return direct

  const leaf = readMdocElementIdentifier(metadataKey)
  if (leaf !== metadataKey) {
    const leafValue = claims[leaf]
    if (hasClaimValue(leafValue)) return leafValue
  }

  const normalizedLeaf = normalizeClaimKey(leaf)
  for (const [claimKey, value] of Object.entries(claims)) {
    if (normalizeClaimKey(readMdocElementIdentifier(claimKey)) === normalizedLeaf && hasClaimValue(value)) {
      return value
    }
  }

  return readNestedClaimValue(claims, metadataKey.split('.'))
}

function readNestedClaimValue(
  claims: Record<string, unknown>,
  pathSegments: string[],
): unknown {
  if (pathSegments.length < 2) return undefined

  let current: unknown = claims
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      current = Number.isInteger(index) ? current[index] : undefined
      continue
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return hasClaimValue(current) ? current : undefined
}

function dedupeThirdPartyClaimsByLeaf(claims: Record<string, unknown>): Record<string, unknown> {
  const deduped: Record<string, unknown> = {}
  const seenLeaves = new Set<string>()

  const entries = Object.entries(claims)
    .filter(([key]) => !key.startsWith('_') && !isHiddenClaimKey(key) && key !== 'doctype' && key !== 'vct')
    .sort(([left], [right]) => right.length - left.length)

  for (const [key, value] of entries) {
    if (!hasClaimValue(value)) continue
    const leaf = normalizeClaimKey(readMdocElementIdentifier(key))
    if (seenLeaves.has(leaf)) continue
    seenLeaves.add(leaf)
    deduped[key] = value
  }

  return deduped
}
