/** OID4VP success wrapper around PresentationSuccessPanel. */

import type { ReactNode } from 'react'

import { PresentationSuccessPanel } from './PresentationSuccessPanel'

type Props = {
  verifierName: string
  onDone: () => void
  children?: ReactNode
}

export function PresentationResultPanel({ verifierName, onDone, children }: Props) {
  return (
    <PresentationSuccessPanel
      fullScreen
      title="ตรวจสอบสำเร็จ"
      message={`ข้อมูลของคุณถูกส่งให้\n ${verifierName} เรียบร้อยแล้ว`}
      buttonLabel="เสร็จสิ้น"
      onDone={onDone}
    >
      {children}
    </PresentationSuccessPanel>
  )
}
