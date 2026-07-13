import { PresentationSuccessPanel } from '@/src/components/PresentationSuccessPanel'

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
      onDone={onDone}
    />
  )
}
