/**
 * Transcript issuance preview plus accept.
 * Journey: P1 claim preview phase.
 * Copy: credentialDisplay / qrIssuanceFlow preview.
 * Layout: CredentialReceiveCardPanel → CredentialDocumentDetailCard.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import type { CredentialHolderProfile } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { CredentialReceiveCardPanel } from './CredentialReceiveCardPanel'

type Props = {
  record: VerifiableCredentialRecord
  holderProfile?: CredentialHolderProfile
  onAccept: () => void
}

export function TranscriptPreviewPanel({
  record,
  holderProfile,
  onAccept,
}: Props) {
  return (
    <CredentialReceiveCardPanel
      testID="transcript-preview-panel"
      contentTestID="transcript-preview-content"
      record={record}
      holderProfile={holderProfile}
      confirmLabel="ยอมรับ"
      onConfirm={onAccept}
    />
  )
}
