import QRCode from 'react-native-qrcode-svg'
import { ActivityIndicator, Text, View } from 'react-native'

import { AppButton } from './AppButton'
import type { WalletInitiatedVpQrPhase } from '../hooks/useWalletInitiatedVpQrSession'

import { THEME } from '../config/themeColors'

type Props = {
  phase: WalletInitiatedVpQrPhase
  qrUrl: string | null
  minutes: string
  seconds: string
  onRetry: () => void
  qrSize?: number
  variant?: 'modal' | 'screen'
}

export function WalletInitiatedVpQrPanel({
  phase,
  qrUrl,
  minutes,
  seconds,
  onRetry,
  qrSize = 220,
  variant = 'screen',
}: Props) {
  if (phase === 'idle') return null

  if (phase === 'loading') {
    return (
      <View className="items-center gap-4 py-8">
        <ActivityIndicator size="large" />
        <Text className="text-center text-sm text-gray600">กำลังสร้าง QR…</Text>
      </View>
    )
  }

  if (phase === 'waiting_scan' && qrUrl) {
    const qrCode = <QRCode value={qrUrl} size={qrSize} />

    return (
      <View className="items-center gap-4">
        {variant === 'screen' ? (
          <View
            className="rounded-[20px] bg-navy-indigo p-4"
            style={{
              elevation: 6,
              shadowColor: THEME.navy,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.28,
              shadowRadius: 14,
            }}
          >
            <View className="items-center justify-center rounded-[10px] bg-white p-2.5">{qrCode}</View>
          </View>
        ) : (
          <View className="rounded-xl bg-white p-4">{qrCode}</View>
        )}
        <Text className="text-center text-base font-semibold text-navy">
          หมดอายุใน {minutes}:{seconds}
        </Text>
      </View>
    )
  }

  if (phase === 'request_ready') {
    return (
      <View className="items-center gap-4 py-8">
        <ActivityIndicator size="large" />
        <Text className="text-center text-sm text-gray600">กำลังเปิดการสำแดง…</Text>
      </View>
    )
  }

  if (phase === 'expired') {
    return (
      <View className="items-center gap-4 py-4">
        <Text className="text-center text-base font-semibold text-danger-dark">QR หมดอายุ</Text>
        <AppButton
          variant="solid-block"
          label="สร้างใหม่"
          onPress={onRetry}
          className="w-full max-w-[220px] rounded-xl py-3"
          textClassName="text-center text-sm font-bold"
        />
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View className="items-center gap-4 py-4">
        <Text className="text-center text-base font-semibold text-danger-dark">ไม่สามารถสร้าง QR ได้</Text>
        <AppButton
          variant="solid-block"
          label="ลองอีกครั้ง"
          onPress={onRetry}
          className="w-full max-w-[220px] rounded-xl py-3"
          textClassName="text-center text-sm font-bold"
        />
      </View>
    )
  }

  return null
}
