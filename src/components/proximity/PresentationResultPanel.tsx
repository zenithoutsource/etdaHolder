import { PresentationSuccessPanel } from '@/src/components/PresentationSuccessPanel'
import { formatMdocFieldLabel } from '@/src/services/proximity/mdocParser'

type PresentationResultPanelProps = {
  sharedFields: string[]
  onDone: () => void
}

export function PresentationResultPanel({ sharedFields, onDone }: PresentationResultPanelProps) {
  return (
    <PresentationSuccessPanel
      title="Success!"
      message={`Shared ${sharedFields.length} field${sharedFields.length === 1 ? '' : 's'}`}
      buttonLabel="Done"
      items={sharedFields.map((fieldKey) => ({
        key: fieldKey,
        label: formatMdocFieldLabel(fieldKey),
        status: 'verified',
      }))}
      onDone={onDone}
    />
  )
}
