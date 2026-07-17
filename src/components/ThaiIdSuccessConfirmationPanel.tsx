import { ThaiIdReceivePanel } from './ThaiIdReceivePanel'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = { record: VerifiableCredentialRecord; onConfirm: () => void }

export function ThaiIdSuccessConfirmationPanel({ record, onConfirm }: Props) {
  return <ThaiIdReceivePanel record={record} onConfirm={onConfirm} />
}
