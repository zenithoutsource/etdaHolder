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
  devEnvLine?: string | null
  onRetry: () => void
  qrSize?: number
  showVerifiedRetry?: boolean
  variant?: 'modal' | 'screen'
}

export function WalletInitiatedVpQrPanel({
  phase,
  qrUrl,
  minutes,
  seconds,
  devEnvLine,
  onRetry,
  qrSize = 220,
  showVerifiedRetry = false,
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

  if (phase === 'ready' && qrUrl) {
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

  if (phase === 'verified') {
    return (
      <View className="items-center gap-4 py-4">
        <Text className="text-center text-base font-semibold text-navy">ตรวจสอบสำเร็จ</Text>
        {showVerifiedRetry ? (
          <AppButton
            variant="solid-block"
            label="สร้างใหม่"
            onPress={onRetry}
            className="w-full max-w-[220px] rounded-xl py-3"
            textClassName="text-center text-sm font-bold"
          />
        ) : null}
      </View>
    )
  }

  if (phase === 'verify_failed') {
    return (
      <View className="items-center gap-4 py-4">
        <Text className="text-center text-base font-semibold text-danger-dark">ไม่ผ่านการตรวจสอบ</Text>
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
        {__DEV__ && devEnvLine ? (
          <View className="w-full rounded-lg bg-gray100 px-3 py-2">
            <Text className="text-xs font-semibold text-navy">Dev: วางใน server/.env</Text>
            <Text selectable className="mt-1 text-[10px] leading-4 text-gray600">
              {devEnvLine}
            </Text>
          </View>
        ) : null}
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
