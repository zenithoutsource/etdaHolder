/** NFC success wrapper reusing OID4VP result UI. No claim/field list. */

import { PresentationResultPanel as VerifierPresentationResultPanel } from '@/src/components/PresentationResultPanel'
import { WALLET_HISTORY_COPY } from '@/src/config/walletHistoryCopy'
import type { OmittedMdocField } from '@/src/services/proximity/nativeProximityModule'

type PresentationResultPanelProps = {
  credentialType?: string
  sharedFields?: string[]
  omittedFields?: OmittedMdocField[]
  onDone: () => void
}

export function PresentationResultPanel({ onDone }: PresentationResultPanelProps) {
  return (
    <VerifierPresentationResultPanel
      verifierName={WALLET_HISTORY_COPY.partyPlaceholderNfc}
      onDone={onDone}
    />
  )
}
