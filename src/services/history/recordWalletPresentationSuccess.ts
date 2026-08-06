import { appendWalletHistoryEvent } from './walletEventLog'

export function recordWalletPresentationSuccess(input: {
  credentialId: string
  documentType: string
  partyName: string
  disclosedClaims: string[]
  channel: 'oid4vp' | 'wallet'
}): void {
  appendWalletHistoryEvent({
    kind: 'presentation-success',
    credentialId: input.credentialId,
    documentType: input.documentType,
    partyName: input.partyName,
    disclosedClaims: input.disclosedClaims,
    channel: input.channel,
  })
}
