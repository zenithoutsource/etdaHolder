import { createHash } from 'react-native-quick-crypto'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import { base64UrlDecodeToString, isRecord, readString } from '@/src/utils/jwtUtils'

export type TransactionDataPresentationContext = {
  /** Raw base64url-encoded transaction_data strings from the authorization request. */
  entries: string[]
  /** Present only when a decoded transaction_data object advertised transaction_data_hashes_alg. */
  hashesAlg?: string
}

const SUPPORTED_TRANSACTION_DATA_HASH_ALGS = new Set(['sha-256'])

function hashTransactionDataEntry(entry: string, alg: string): string {
  if (!SUPPORTED_TRANSACTION_DATA_HASH_ALGS.has(alg)) {
    throw new Error(
      `PresentationRequestUnsupported: transaction_data hash algorithm ${alg} is not supported`,
    )
  }

  return base64UrlEncodeBytes(createHash('sha256').update(entry, 'utf8').digest())
}

function readTransactionDataHashesAlg(entries: readonly string[]): string | undefined {
  let resolved: string | undefined

  for (const entry of entries) {
    let parsed: unknown
    try {
      parsed = JSON.parse(base64UrlDecodeToString(entry)) as unknown
    } catch {
      continue
    }

    if (!isRecord(parsed)) continue
    const alg = readString(parsed.transaction_data_hashes_alg)
    if (!alg) continue

    if (resolved && resolved !== alg) {
      throw new Error('PresentationRequestInvalid: conflicting transaction_data_hashes_alg values')
    }
    resolved = alg
  }

  return resolved
}

export function parseTransactionDataFromAuthorizationRequest(
  authorizationRequest: Record<string, unknown>,
): TransactionDataPresentationContext | undefined {
  const raw = authorizationRequest.transaction_data
  if (!Array.isArray(raw) || raw.length === 0) return undefined

  const entries = raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  if (entries.length === 0) {
    throw new Error('PresentationRequestInvalid: transaction_data must be a non-empty array of strings')
  }

  const hashesAlg = readTransactionDataHashesAlg(entries)
  return {
    entries,
    ...(hashesAlg ? { hashesAlg } : {}),
  }
}

/** OID4VP 1.0 KB-JWT claims for transaction_data binding (Appendix B.3.3.1 profile). */
export function buildTransactionDataKbJwtClaims(
  context: TransactionDataPresentationContext | undefined,
): Record<string, unknown> {
  if (!context || context.entries.length === 0) return {}

  const alg = context.hashesAlg ?? 'sha-256'
  const transactionDataHashes = context.entries.map((entry) => hashTransactionDataEntry(entry, alg))

  return {
    transaction_data_hashes: transactionDataHashes,
    ...(context.hashesAlg ? { transaction_data_hashes_alg: context.hashesAlg } : {}),
  }
}
