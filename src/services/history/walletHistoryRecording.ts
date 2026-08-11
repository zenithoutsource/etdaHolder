import { getCardSchema } from '../../config/cardSchemas'
import {
  readHistoryDocumentLabel,
  readHistoryIssuerPartyName,
} from '../../config/historyDisplayNames'
import { readPresentationVerifierDisplayName } from '../../config/presentationVerifierMocks'
import { WALLET_HISTORY_COPY } from '../../config/walletHistoryCopy'
import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'
import type { ResolvedPresentationRequest } from '../vp/presentationService'
import {
  appendWalletHistoryEvent,
  classifyCredentialVerifyFailure,
  classifyPresentationFailure,
  type WalletHistoryDeliveryPath,
  type WalletHistoryFailureReason,
} from './walletEventLog'
import { readActiveOfferDeliveryPath } from './historyDeliveryPath'
import { readCredentialIssuerName } from '../credentials/credentialIssuer'

export function recordOid4vpPresentationFailure(
  request: ResolvedPresentationRequest,
  error: unknown,
  disclosedClaims: string[],
  deliveryPath?: WalletHistoryDeliveryPath,
): void {
  const credentialType = request.matchedCredential.type
  const verifierDisplayName = readPresentationVerifierDisplayName(
    credentialType,
    request.verifier.name,
  )
  appendWalletHistoryEvent({
    kind: 'presentation-failed',
    credentialId: request.matchedCredential.id,
    documentType: readHistoryDocumentLabel({ credentialType }),
    partyName: verifierDisplayName,
    disclosedClaims,
    channel: 'oid4vp',
    credentialType,
    ...(deliveryPath ? { deliveryPath } : {}),
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
  appendWalletHistoryEvent({
    kind: 'presentation-failed',
    credentialId: input.record.id,
    documentType: readHistoryDocumentLabel({ credentialType: input.record.type }),
    partyName: WALLET_HISTORY_COPY.partyFallbackVerifier,
    disclosedClaims: input.disclosedClaims,
    channel: 'wallet',
    credentialType: input.record.type,
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
  deliveryPath?: WalletHistoryDeliveryPath
}): void {
  const offeredType = input.resolvedOffer.credentialConfigurations[0]?.id ?? 'Unknown'
  const schema = getCardSchema(offeredType)
  const credentialType = schema.type !== '__fallback__' ? schema.type : offeredType
  const offerDisplayName = input.resolvedOffer.credentialConfigurations[0]?.display?.name
  const deliveryPath = input.deliveryPath ?? readActiveOfferDeliveryPath()
  appendWalletHistoryEvent({
    kind: 'credential-verify-failed',
    credentialId:
      input.credentialId ??
      `unverified:${input.resolvedOffer.issuer}:${offeredType}`,
    documentType: readHistoryDocumentLabel({
      credentialType,
      offerDisplayName,
    }),
    partyName: readHistoryIssuerPartyName({
      credentialType,
      protocolIssuerName: input.resolvedOffer.issuerDisplay?.name ?? schema.issuerName,
    }),
    channel: input.channel ?? 'oid4vci',
    credentialType,
    ...(deliveryPath ? { deliveryPath } : {}),
    reasonCode: classifyCredentialVerifyFailure(input.error),
  })
}

export function recordCredentialRenewalCompleted(
  record: VerifiableCredentialRecord,
): void {
  appendWalletHistoryEvent({
    kind: 'credential-renewal-completed',
    credentialId: record.id,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: readHistoryIssuerPartyName({
      credentialType: record.type,
      protocolIssuerName: readCredentialIssuerName(record),
    }),
    channel: 'renewal',
    credentialType: record.type,
  })
}

export function recordBackendSyncHistory(
  record: VerifiableCredentialRecord,
  outcome: 'success' | 'failure',
  error?: unknown,
): void {
  appendWalletHistoryEvent({
    kind: outcome === 'success' ? 'backend-sync-success' : 'backend-sync-failed',
    credentialId: record.id,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: WALLET_HISTORY_COPY.partyPlaceholderBackend,
    channel: 'backend',
    credentialType: record.type,
    reasonCode: outcome === 'failure' ? classifyPresentationFailure(error) : undefined,
  })
}

export function recordNfcPresentationSuccess(
  record: VerifiableCredentialRecord,
  disclosedLabels: string[],
): void {
  appendWalletHistoryEvent({
    kind: 'nfc-presentation-success',
    credentialId: record.id,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: WALLET_HISTORY_COPY.partyPlaceholderNfc,
    disclosedClaims: disclosedLabels,
    channel: 'nfc',
    credentialType: record.type,
  })
}

export function recordNfcPresentationFailure(
  record: VerifiableCredentialRecord,
  disclosedLabels: string[],
  error?: unknown,
): void {
  appendWalletHistoryEvent({
    kind: 'nfc-presentation-failed',
    credentialId: record.id,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: WALLET_HISTORY_COPY.partyPlaceholderNfc,
    disclosedClaims: disclosedLabels,
    channel: 'nfc',
    credentialType: record.type,
    reasonCode: error ? 'nfc-error' : 'unknown',
  })
}

export function recordNfcPresentationDeclined(
  record: VerifiableCredentialRecord,
  disclosedLabels: string[],
): void {
  appendWalletHistoryEvent({
    kind: 'presentation-declined',
    credentialId: record.id,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: WALLET_HISTORY_COPY.partyPlaceholderNfc,
    disclosedClaims: disclosedLabels,
    channel: 'nfc',
    credentialType: record.type,
  })
}
