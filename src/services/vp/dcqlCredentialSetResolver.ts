import { logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  assertSupportedDcqlCredentialQuery,
  canWalletSatisfyDcqlCredentialQuery,
  describeDcqlMatchFailure,
} from './dcqlCredentialMatch'
import type { DcqlCredentialSetQuery, DcqlQuery } from './presentationService'

export function parseDcqlCredentialSets(value: unknown): DcqlCredentialSetQuery[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined

  return value.map(readDcqlCredentialSetQuery).filter((set): set is DcqlCredentialSetQuery => Boolean(set))
}

function readDcqlCredentialSetQuery(value: unknown): DcqlCredentialSetQuery | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.options)) return undefined

  const options = record.options
    .map((option) => (Array.isArray(option) ? option.filter((id): id is string => typeof id === 'string') : []))
    .filter((option) => option.length > 0)

  if (options.length === 0) return undefined

  return {
    options,
    ...(typeof record.required === 'boolean' ? { required: record.required } : {}),
  }
}

export function resolveDcqlCredentialSelection(
  query: DcqlQuery,
  credentials: VerifiableCredentialRecord[],
): DcqlQuery {
  const sets = query.credentialSets
  if (!sets || sets.length === 0) return query

  assertSupportedCredentialSetsShape(sets)

  const credentialById = new Map(query.credentials.map((credential) => [credential.id, credential]))
  const referencedIds = [...new Set(sets[0]!.options.flat())]

  for (const id of referencedIds) {
    if (!credentialById.has(id)) {
      throw new Error('PresentationRequestInvalid: credential_sets option references unknown credential id')
    }
  }

  const supportedOptionIds = sets[0]!.options
    .filter((option) => option.length === 1)
    .map((option) => option[0]!)
    .filter((id) => {
      const credential = credentialById.get(id)
      if (!credential) return false
      try {
        assertSupportedDcqlCredentialQuery(credential)
        return true
      } catch {
        return false
      }
    })

  if (supportedOptionIds.length === 0) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }

  const selectedId = supportedOptionIds.find((id) => {
    const credential = credentialById.get(id)
    if (!credential) return false
    return credentials.some((record) => canWalletSatisfyDcqlCredentialQuery(record, credential))
  })

  if (!selectedId) {
    const failures = supportedOptionIds.flatMap((id) => {
      const credential = credentialById.get(id)
      if (!credential) return []
      return credentials.map((record) => describeDcqlMatchFailure(record, credential))
    })
    if (__DEV__) {
      for (const failure of failures) {
        logWalletStep('oid4vp', 'dcql-match-failed', failure)
      }
    }
    if (failures.some((failure) => failure.failedGate === 'vct')) {
      const mismatch = failures.find((failure) => failure.failedGate === 'vct')!
      throw new Error(
        `PresentationCredentialMetadataMismatch: stored ${mismatch.recordType} vct "${mismatch.recordVct ?? 'missing'}" is not in requested vct_values [${mismatch.requestedVctValues.join(', ')}]`,
      )
    }
    if (failures.some((failure) => failure.failedGate === 'format')) {
      throw new Error('PresentationCredentialFormatUnsupported: stored credential format does not match the Verifier request')
    }
    throw new Error('PresentationCredentialMissing: no credential satisfies the required credential set')
  }

  return {
    credentials: query.credentials.filter((credential) => credential.id === selectedId),
    credentialSets: undefined,
  }
}

function assertSupportedCredentialSetsShape(sets: DcqlCredentialSetQuery[]): void {
  if (sets.length === 0) {
    throw new Error('PresentationRequestInvalid: credential_sets must be a non-empty array')
  }

  if (sets.length > 1) {
    throw new Error('PresentationRequestUnsupported: multiple credential_sets entries are not supported in v1')
  }

  const set = sets[0]!
  if (set.required === false) {
    throw new Error('PresentationRequestUnsupported: optional credential_sets are not supported in v1')
  }

  for (const option of set.options) {
    if (option.length === 0) {
      throw new Error('PresentationRequestInvalid: credential_sets option must not be empty')
    }
    if (option.length > 1) {
      throw new Error('PresentationRequestUnsupported: multi-credential credential_sets options are not supported in v1')
    }
  }
}
