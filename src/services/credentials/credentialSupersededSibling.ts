/**
 * Locate superseded same-family siblings for Home view-old link and detail inactive state.
 */

import { areCredentialsSameReissueFamily } from './credentialReissueFamily'
import {
  isCredentialWithdrawnFromUse,
  pickPreferredHomeCredential,
} from './credentialGuard'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import {
  readCredentialRenewalStatuses,
  type CredentialRenewalRecord,
} from './credentialKeyRenewal'
import { isRenewalAwaitingHolderCleanup } from './renewalCleanupNotification'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function findSupersededOldCredentialForDisplay({
  preferredCredential,
  credentials,
  renewalStatuses,
}: {
  preferredCredential: VerifiableCredentialRecord
  credentials: VerifiableCredentialRecord[]
  renewalStatuses: Record<string, CredentialRenewalRecord>
}): { oldCredentialId: string } | undefined {
  const p3Old = credentials.find((candidate) => {
    if (candidate.id === preferredCredential.id) return false
    const renewal = renewalStatuses[candidate.id]
    return (
      isRenewalAwaitingHolderCleanup(renewal) &&
      renewal?.replacementCredentialId === preferredCredential.id
    )
  })
  if (p3Old) return { oldCredentialId: p3Old.id }

  const olderSibling = credentials.find((candidate) => {
    if (candidate.id === preferredCredential.id) return false
    if (!areCredentialsSameReissueFamily(candidate, preferredCredential)) return false
    if (isCredentialWithdrawnFromUse(candidate.id)) return false
    if (isCredentialDocumentExpired(candidate)) return false
    const state = renewalStatuses[candidate.id]?.state
    if (state === 'old-revoked') return false
    const candidateTime = Date.parse(candidate.issuedAt)
    const preferredTime = Date.parse(preferredCredential.issuedAt)
    if (Number.isNaN(candidateTime) || Number.isNaN(preferredTime)) return false
    return candidateTime < preferredTime
  })

  if (!olderSibling) return undefined

  const familyMatches = credentials.filter((candidate) =>
    areCredentialsSameReissueFamily(candidate, preferredCredential),
  )
  const winner = pickPreferredHomeCredential(familyMatches, renewalStatuses)
  if (winner?.id !== preferredCredential.id) return undefined

  return { oldCredentialId: olderSibling.id }
}

export function isCredentialSupersededByNewerSibling(
  credentialId: string,
  credentials: VerifiableCredentialRecord[],
  renewalStatuses: Record<string, CredentialRenewalRecord> = readCredentialRenewalStatuses(
    credentials,
  ),
): boolean {
  const credential = credentials.find((entry) => entry.id === credentialId)
  if (!credential) return false

  const newerSibling = credentials.find((candidate) => {
    if (candidate.id === credentialId) return false
    if (!areCredentialsSameReissueFamily(candidate, credential)) return false
    if (isCredentialDocumentExpired(candidate)) return false
    const candidateTime = Date.parse(candidate.issuedAt)
    const selfTime = Date.parse(credential.issuedAt)
    return !Number.isNaN(candidateTime) && !Number.isNaN(selfTime) && candidateTime > selfTime
  })
  if (!newerSibling) return false

  return (
    findSupersededOldCredentialForDisplay({
      preferredCredential: newerSibling,
      credentials,
      renewalStatuses,
    })?.oldCredentialId === credentialId
  )
}
