import { logWalletError } from '../debug/walletLogger'
import {
  appendWalletHistoryEvent,
  clearSuccessfulPresentationBadge as clearWalletPresentationBadge,
  readSuccessfullyPresentedCredentialIds as readWalletPresentedCredentialIds,
  readWalletHistoryEvents,
} from './walletEventLog'
import type { SuccessfulPresentationHistoryEvent } from './walletHistory'

export type RecordSuccessfulPresentationInput = {
  credentialId: string
  verifierName: string
  documentType: string
  disclosedClaims: string[]
  now?: Date
}

export function recordSuccessfulPresentation(
  input: RecordSuccessfulPresentationInput,
): SuccessfulPresentationHistoryEvent | undefined {
  const occurredAt = (input.now ?? new Date()).toISOString()
  const appended = appendWalletHistoryEvent({
    kind: 'presentation-success',
    credentialId: input.credentialId,
    documentType: input.documentType,
    partyName: input.verifierName,
    disclosedClaims: input.disclosedClaims,
    channel: 'oid4vp',
    occurredAt,
  })

  if (!appended) {
    logWalletError(
      'presentation-history',
      'record-successful-presentation-failed',
      new Error('appendWalletHistoryEvent returned undefined'),
      { credentialId: input.credentialId },
    )
    return undefined
  }

  return {
    id: appended.id,
    credentialId: input.credentialId,
    verifierName: input.verifierName,
    documentType: input.documentType,
    disclosedClaims: input.disclosedClaims,
    occurredAt,
  }
}

export function readSuccessfulPresentationHistory(): SuccessfulPresentationHistoryEvent[] {
  return readWalletHistoryEvents()
    .filter((event) => event.kind === 'presentation-success' && event.channel === 'oid4vp')
    .map((event) => ({
      id: event.id,
      credentialId: event.credentialId,
      verifierName: event.partyName,
      documentType: event.documentType,
      disclosedClaims: event.disclosedClaims,
      occurredAt: event.occurredAt,
    }))
}

export function readSuccessfullyPresentedCredentialIds(): string[] {
  return readWalletPresentedCredentialIds()
}

export function clearSuccessfulPresentationBadge(credentialId: string, now = new Date()): void {
  clearWalletPresentationBadge(credentialId, now)
}
