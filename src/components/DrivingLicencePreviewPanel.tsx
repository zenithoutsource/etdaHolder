/**
 * Issuance accept preview for driving licence.
 * Journey: P1 claim (CredentialOfferClaimScreen).
 * Layout: CredentialReceiveCardPanel → CredentialDocumentDetailCard.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import type { CredentialHolderProfile } from '../services/credentials/credentialDisplay'
import { CredentialReceiveCardPanel } from './CredentialReceiveCardPanel'

type DrivingLicencePreviewPanelProps = Readonly<{
  record: VerifiableCredentialRecord
  holderProfile?: CredentialHolderProfile
  onAccept: () => void
}>

export function DrivingLicencePreviewPanel({
  record,
  holderProfile,
  onAccept,
}: DrivingLicencePreviewPanelProps) {
  return (
    <CredentialReceiveCardPanel
      testID="driving-licence-preview-panel"
      contentTestID="driving-licence-preview-content"
      record={record}
      holderProfile={holderProfile}
      confirmLabel="ยอมรับ"
      onConfirm={onAccept}
    />
  )
}
