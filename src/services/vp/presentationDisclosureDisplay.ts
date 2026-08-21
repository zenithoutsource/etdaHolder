/**
 * Holder-facing presentment list shaping (consent, info requested items, NFC pre-tap).
 * Hides religion in the UI only; VP submit keys stay on the original disclosure set.
 * Driving-licence given name is shown above family name when those are separate rows.
 */

import { normalizeClaimKey, readMdocElementIdentifier } from '@/src/utils/claimKeyNormalization'

const RELIGION_IDENTIFIERS = new Set(['religion', 'ศาสนา'])
const GIVEN_NAME_IDENTIFIERS = new Set(['givenname', 'firstname', 'ชื่อ'])
const FAMILY_NAME_IDENTIFIERS = new Set(['familyname', 'lastname', 'นามสกุล'])

function readDisclosureIdentifier(key: string): string {
  return normalizeClaimKey(readMdocElementIdentifier(key))
}

export function isHiddenPresentmentDisclosure(item: { key: string; label?: string }): boolean {
  if (RELIGION_IDENTIFIERS.has(readDisclosureIdentifier(item.key))) return true
  const compactLabel = (item.label ?? '').replace(/\s/g, '')
  if (compactLabel.includes('ศาสนา')) return true
  return normalizeClaimKey(item.label ?? '') === 'religion'
}

export function orderGivenNameBeforeFamilyName<T extends { key: string }>(items: T[]): T[] {
  const givenIndex = items.findIndex((item) => GIVEN_NAME_IDENTIFIERS.has(readDisclosureIdentifier(item.key)))
  const familyIndex = items.findIndex((item) => FAMILY_NAME_IDENTIFIERS.has(readDisclosureIdentifier(item.key)))
  if (givenIndex < 0 || familyIndex < 0 || givenIndex < familyIndex) return items

  const next = [...items]
  const [given] = next.splice(givenIndex, 1)
  next.splice(familyIndex, 0, given)
  return next
}

export function prepareHolderFacingDisclosureItems<T extends { key: string; label?: string }>(
  items: T[],
): T[] {
  return orderGivenNameBeforeFamilyName(items.filter((item) => !isHiddenPresentmentDisclosure(item)))
}
