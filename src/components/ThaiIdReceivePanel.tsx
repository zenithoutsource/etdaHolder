/**
 * PID receive preview card plus confirm.
 * Journey: P1 claim preview phase.
 * Copy: cardSchemas; credentialDisplay.
 * Layout: CredentialReceiveCardPanel → CredentialDocumentDetailCard.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import type { CredentialHolderProfile } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { CredentialReceiveCardPanel } from './CredentialReceiveCardPanel'

type Props = {
  record: VerifiableCredentialRecord
  holderProfile?: CredentialHolderProfile
  onConfirm: () => void
}

export function ThaiIdReceivePanel({ record, holderProfile, onConfirm }: Props) {
  return (
    <CredentialReceiveCardPanel
      testID="thai-id-receive-panel"
      contentTestID="thai-id-receive-content"
      record={record}
      holderProfile={holderProfile}
      confirmLabel="ยืนยัน"
      onConfirm={onConfirm}
    />
  )
}
