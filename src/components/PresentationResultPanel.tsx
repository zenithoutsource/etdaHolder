import { PresentationSuccessPanel } from './PresentationSuccessPanel'

export type PresentationResultItem = {
  key: string
  label: string
  status: 'verified' | 'used'
}

type Props = {
  verifierName: string
  items: PresentationResultItem[]
  onDone: () => void
}

export function PresentationResultPanel({ verifierName, items, onDone }: Props) {
  return (
    <PresentationSuccessPanel
      fullScreen
      title="ตรวจสอบสำเร็จ"
      message={`ข้อมูลของคุณถูกส่งให้\n ${verifierName}เรียบร้อยแล้ว`}
      buttonLabel="เสร็จสิ้น"
      items={items}
      onDone={onDone}
    />
  )
}
