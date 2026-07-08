import { useEffect, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'

type Props = {
  signature: string
}

const COPIED_RESET_MS = 1500

export function PresentationPopCard({ signature }: Props) {
  const [copied, setCopied] = useState(false)
  const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copiedResetTimeoutRef.current) {
      clearTimeout(copiedResetTimeoutRef.current)
    }
  }, [])

  async function handleCopy() {
    await Clipboard.setStringAsync(signature)
    setCopied(true)
    if (copiedResetTimeoutRef.current) {
      clearTimeout(copiedResetTimeoutRef.current)
    }
    copiedResetTimeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
  }

  return (
    <View>
      <Text className="text-[13px] font-extrabold text-navy-deep">ลายเซ็นดิจิทัล  POP (Proof of Possession )</Text>
      <View className="mt-2 rounded-2xl bg-navy-royal p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-[12px] font-bold text-white">ECDSA - 256</Text>
          <Text className="text-[12px] font-bold text-white">HASH_SHA256</Text>
        </View>
        <Text className="mt-3 text-[11px] leading-[18px] text-blue-mist" numberOfLines={3}>
          {signature}
        </Text>
        <AppButton
          accessibilityRole="button"
          label={copied ? 'คัดลอกแล้ว' : 'คัดลอกลายเซ็น'}
          onPress={() => { void handleCopy() }}
          className="mt-3 h-8 self-end justify-center border-0 bg-blue-950 px-4"
          textClassName="text-[12px] font-bold text-white"
        />
      </View>
    </View>
  )
}
