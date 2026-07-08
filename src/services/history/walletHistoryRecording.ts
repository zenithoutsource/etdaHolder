import { getCardSchema } from '../../config/cardSchemas'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import type { ResolvedPresentationRequest } from '../vp/presentationService'
import {
  appendWalletHistoryEvent,
  classifyPresentationFailure,
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
