import { PresentationSuccessPanel } from './PresentationSuccessPanel'

type Props = {
  verifierName: string
  onDone: () => void
}

export function PresentationResultPanel({ verifierName, onDone }: Props) {
  return (
    <PresentationSuccessPanel
      fullScreen
      title="ตรวจสอบสำเร็จ"
      message={`ข้อมูลของคุณถูกส่งให้\n ${verifierName}เรียบร้อยแล้ว`}
      buttonLabel="เสร็จสิ้น"
      onDone={onDone}
    />
  )
}
