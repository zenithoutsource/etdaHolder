/**
 * Issuer-aware reissue family matching for replace, cleanup, and Home supersede UX.
 */

import {
  readUnregisteredDocumentGroupKey,
  resolveFirstPartyType,
} from '../../config/firstPartyCredential'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

function readHostname(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed?.includes('://')) return undefined
  try {
    return new URL(trimmed).hostname.toLowerCase() || undefined
  } catch {
    return undefined
  }
}

export function readCredentialIssuerHostname(
  record: Pick<VerifiableCredentialRecord, 'issuerUrl' | 'claims'>,
): string | undefined {
  const claims = record.claims ?? {}
  const candidates = [record.issuerUrl, claims.iss, claims.vct]
  for (const value of candidates) {
    if (typeof value !== 'string') continue
    const hostname = readHostname(value)
    if (hostname) return hostname
  }
  return undefined
}

export function areCredentialsSameReissueFamily(
  left: VerifiableCredentialRecord,
  right: VerifiableCredentialRecord,
): boolean {
  const leftFirstParty = resolveFirstPartyType(left)
  const rightFirstParty = resolveFirstPartyType(right)

  const leftHost = readCredentialIssuerHostname(left)
  const rightHost = readCredentialIssuerHostname(right)
  if (leftHost && rightHost && leftHost !== rightHost) return false
  if ((leftHost && !rightHost) || (!leftHost && rightHost)) return false

  if (leftFirstParty && rightFirstParty) {
    return leftFirstParty === rightFirstParty
  }
  if (leftFirstParty || rightFirstParty) return false

  return readUnregisteredDocumentGroupKey(left) === readUnregisteredDocumentGroupKey(right)
}
