import { useEffect, useRef } from 'react'

import { useAppDialog } from '@/src/components/AppDialog'
import { useDeeplinkStore } from '@/src/store/deeplinkStore'

export function PresentationIntakeErrorHost() {
  const { showDialog } = useAppDialog()
  const message = useDeeplinkStore((state) => state.presentationIntakeError)
  const clearPresentationIntakeError = useDeeplinkStore((state) => state.clearPresentationIntakeError)
  const shownMessageRef = useRef<string | null>(null)

  useEffect(() => {
    if (!message || shownMessageRef.current === message) return

    shownMessageRef.current = message
    showDialog({
      title: 'เปิดคำขอตรวจสอบไม่ได้',
      message,
      icon: 'warning',
      actions: [{
        label: 'ตกลง',
        variant: 'primary',
        onPress: () => {
          shownMessageRef.current = null
          clearPresentationIntakeError()
        },
      }],
    })
  }, [clearPresentationIntakeError, message, showDialog])

  return null
}
