/** NFC success wrapper reusing OID4VP result UI plus WALLET_HISTORY_COPY. */

import { PresentationResultPanel as VerifierPresentationResultPanel } from '@/src/components/PresentationResultPanel'
import { WALLET_HISTORY_COPY } from '@/src/config/walletHistoryCopy'

type PresentationResultPanelProps = {
  sharedFields?: string[]
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
