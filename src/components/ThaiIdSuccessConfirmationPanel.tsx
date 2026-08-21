/** PID DOPA confirm step — thin wrapper over IssuanceTrustConfirmationPanel. */

import { IssuanceTrustConfirmationPanel } from './IssuanceTrustConfirmationPanel'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = {
  record?: VerifiableCredentialRecord
  credentialType?: string
  onConfirm: () => void
}

export function ThaiIdSuccessConfirmationPanel({ record, credentialType, onConfirm }: Props) {
  return (
    <IssuanceTrustConfirmationPanel
      variant="pidDopa"
      record={record}
      credentialType={credentialType}
      onConfirm={onConfirm}
    />
  )
}
