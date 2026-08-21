/**
 * Home catalog extras: unregistered credentials listed after first-party rows.
 */

import {
  isFirstPartyCredential,
  readUnregisteredDocumentGroupKey,
  resolveFirstPartyType,
} from '../../config/firstPartyCredential'
import type { CredentialRenewalRecord } from './credentialKeyRenewal'
import { pickPreferredHomeCredential } from './credentialGuard'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export type UnregisteredHomeDocument = {
  record: VerifiableCredentialRecord
  label: string
}

export function readUnregisteredHomeDocumentLabel(record: VerifiableCredentialRecord): string {
  return (
    record.credentialDisplayName?.trim() ||
    record.issuerName?.trim() ||
    'Digital Document'
  )
}

export function listUnregisteredHomeDocuments(
  credentials: VerifiableCredentialRecord[],
  renewalStatuses: Record<string, CredentialRenewalRecord>,
): UnregisteredHomeDocument[] {
  const grouped = new Map<string, VerifiableCredentialRecord[]>()

  for (const record of credentials) {
    if (isFirstPartyCredential(record)) continue
    const groupKey = readUnregisteredDocumentGroupKey(record)
    const group = grouped.get(groupKey) ?? []
    group.push(record)
    grouped.set(groupKey, group)
  }

  return [...grouped.values()]
    .map((group) => pickPreferredHomeCredential(group, renewalStatuses))
    .filter((record): record is VerifiableCredentialRecord => Boolean(record))
    .map((record) => ({
      record,
      label: readUnregisteredHomeDocumentLabel(record),
    }))
}

export function isCatalogFirstPartyMatch(
  record: VerifiableCredentialRecord,
  catalogType: string,
): boolean {
  return resolveFirstPartyType(record) === catalogType
}
