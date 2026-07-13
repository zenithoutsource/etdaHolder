import { getCardSchema } from '../../config/cardSchemas'
import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'
import type { ResolvedPresentationRequest } from '../vp/presentationService'
import {
  appendWalletHistoryEvent,
  classifyCredentialVerifyFailure,
  classifyPresentationFailure,
  type WalletHistoryFailureReason,
} from './walletEventLog'

export function recordOid4vpPresentationFailure(
  request: ResolvedPresentationRequest,
  error: unknown,
): void {
  appendWalletHistoryEvent({
    kind: 'presentation-failed',
    credentialId: request.matchedCredential.id,
    documentType: getCardSchema(request.matchedCredential.type).title,
    partyName: request.verifier.name,
    disclosedClaims: request.disclosures.map((disclosure) => disclosure.label),
    channel: 'oid4vp',
    reasonCode: classifyPresentationFailure(error),
  })
}

export function mapVerifierReasonToHistory(reason: string | undefined): WalletHistoryFailureReason {
  if (!reason) return 'verifier-rejected'
  if (reason === 'issuer-signature-invalid') return 'signature-invalid'
  if (reason === 'cnf-missing' || reason === 'kb-signature-invalid' || reason.includes('holder-binding')) {
    return 'holder-binding-mismatch'
  }
  return 'verifier-rejected'
}

export function recordWalletInitiatedPresentationFailure(input: {
  record: VerifiableCredentialRecord
  verifierReason?: string
  disclosedClaims: string[]
}): void {
  const schema = getCardSchema(input.record.type)
  appendWalletHistoryEvent({
    kind: 'presentation-failed',
    credentialId: input.record.id,
    documentType: schema.title,
    partyName: 'Verifier',
    disclosedClaims: input.disclosedClaims,
    channel: 'wallet',
    reasonCode: mapVerifierReasonToHistory(input.verifierReason),
  })
}

/**
 * P3 / P2 receive-side step: record local history when Issuer VC signature /
 * holder-binding verification fails before storage (Wallet-local Audit Trail stand-in).
 */
export function recordCredentialVerifyFailed(input: {
  resolvedOffer: ResolvedCredentialOffer
  error: unknown
  credentialId?: string
  channel?: 'oid4vci' | 'renewal'
}): void {
  const offeredType = input.resolvedOffer.credentialConfigurations[0]?.id ?? 'Unknown'
  const schema = getCardSchema(offeredType)
  appendWalletHistoryEvent({
    kind: 'credential-verify-failed',
    credentialId:
      input.credentialId ??
      `unverified:${input.resolvedOffer.issuer}:${offeredType}`,
    documentType: schema.title,
    partyName: schema.issuerName,
    channel: input.channel ?? 'oid4vci',
    reasonCode: classifyCredentialVerifyFailure(input.error),
  })
}

export function recordCredentialRenewalCompleted(
  record: VerifiableCredentialRecord,
): void {
  const schema = getCardSchema(record.type)
  appendWalletHistoryEvent({
    kind: 'credential-renewal-completed',
    credentialId: record.id,
    documentType: schema.title,
    partyName: schema.issuerName,
    channel: 'renewal',
  })
}

export function recordBackendSyncHistory(
  record: VerifiableCredentialRecord,
  outcome: 'success' | 'failure',
  error?: unknown,
): void {
  const schema = getCardSchema(record.type)
  appendWalletHistoryEvent({
    kind: outcome === 'success' ? 'backend-sync-success' : 'backend-sync-failed',
    credentialId: record.id,
    documentType: schema.title,
    partyName: 'Wallet Backend',
    channel: 'backend',
    reasonCode: outcome === 'failure' ? classifyPresentationFailure(error) : undefined,
  })
}

export function recordNfcPresentationSuccess(
  record: VerifiableCredentialRecord,
  disclosedLabels: string[],
): void {
  const schema = getCardSchema(record.type)
  appendWalletHistoryEvent({
    kind: 'nfc-presentation-success',
    credentialId: record.id,
    documentType: schema.title,
    partyName: 'NFC Reader',
    disclosedClaims: disclosedLabels,
    channel: 'nfc',
  })
}

export function recordNfcPresentationFailure(
  record: VerifiableCredentialRecord,
  disclosedLabels: string[],
  error?: unknown,
): void {
  const schema = getCardSchema(record.type)
  appendWalletHistoryEvent({
    kind: 'nfc-presentation-failed',
    credentialId: record.id,
    documentType: schema.title,
    partyName: 'NFC Reader',
    disclosedClaims: disclosedLabels,
    channel: 'nfc',
    reasonCode: error ? 'nfc-error' : 'unknown',
  })
}

export function recordNfcPresentationDeclined(
  record: VerifiableCredentialRecord,
  disclosedLabels: string[],
): void {
  const schema = getCardSchema(record.type)
  appendWalletHistoryEvent({
    kind: 'presentation-declined',
    credentialId: record.id,
    documentType: schema.title,
    partyName: 'NFC Reader',
    disclosedClaims: disclosedLabels,
    channel: 'nfc',
  })
}
