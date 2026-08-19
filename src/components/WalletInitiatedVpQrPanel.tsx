/**
 * My QR UI — loading, QR + timer, expired, error.
 * Journey: P4 My QR tab and VpQrModal.
 * Copy: WALLET_HOME_COPY (myQr*).
 * Next: useWalletInitiatedVpQrSession phases.
 * Map: docs/CODEMAPS/frontend.md#my-qr
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { ComponentProps, ReactNode } from 'react'
import QRCode from 'react-native-qrcode-svg'
import { ActivityIndicator, Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { THEME } from '../config/themeColors'
import type { WalletInitiatedVpQrPhase } from '../hooks/useWalletInitiatedVpQrSession'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'

type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>['name']

type Props = {
  phase: WalletInitiatedVpQrPhase
  qrUrl: string | null
  minutes: string
  seconds: string
  onRetry: () => void
  qrSize?: number
  variant?: 'modal' | 'screen'
}

const QR_FRAME_SHADOW = {
  elevation: 6,
  shadowColor: THEME.navy,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.28,
  shadowRadius: 14,
}

function QrFrame({
  faded = false,
  children,
}: {
  faded?: boolean
  children: ReactNode
}) {
  return (
    <View
      className={`rounded-[20px] bg-navy-indigo p-4 ${faded ? 'opacity-45' : ''}`}
      style={QR_FRAME_SHADOW}
    >
      <View className="items-center justify-center rounded-[10px] bg-white p-2.5">{children}</View>
    </View>
  )
}

function QrUnavailableState({
  variant,
  qrSize,
  icon,
  title,
  body,
  actionLabel,
  onRetry,
  testID,
}: {
  variant: 'modal' | 'screen'
  qrSize: number
  icon: MaterialIconName
  title: string
  body: string
  actionLabel: string
  onRetry: () => void
  testID: string
}) {
  const isModal = variant === 'modal'

  return (
    <View testID={testID} className="w-full items-center">
      {isModal ? (
        <View className="h-16 w-16 items-center justify-center rounded-full bg-slate100">
          <MaterialCommunityIcons name={icon} size={32} color={THEME.navy} />
        </View>
      ) : (
        <QrFrame faded>
          <View
            className="items-center justify-center"
            style={{ width: qrSize, height: qrSize }}
          >
            <MaterialCommunityIcons name={icon} size={64} color={THEME.navyMid} />
          </View>
        </QrFrame>
      )}

      <Text
        className={`text-center font-extrabold text-ink ${
          isModal ? 'mt-5 text-lg leading-6' : 'mt-7 text-xl leading-7'
        }`}
      >
        {title}
      </Text>
      <Text className={`text-center text-sm leading-6 text-gray600 ${isModal ? 'mt-2' : 'mt-3'}`}>
        {body}
      </Text>
      <AppButton
        testID={`${testID}-retry`}
        variant="solid-block"
        label={actionLabel}
        onPress={onRetry}
        fullWidth
        className={`${isModal ? 'mt-5' : 'mt-8'} max-w-[280px] rounded-xl py-4`}
        textClassName="text-center text-sm font-bold"
      />
    </View>
  )
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
        {variant === 'screen' ? <QrFrame>{qrCode}</QrFrame> : (
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
      <QrUnavailableState
        variant={variant}
        qrSize={qrSize}
        icon="qrcode-remove"
        title={WALLET_HOME_COPY.myQrExpiredTitle}
        body={WALLET_HOME_COPY.myQrExpiredMessage}
        actionLabel={WALLET_HOME_COPY.myQrExpiredAction}
        onRetry={onRetry}
        testID="wallet-initiated-vp-qr-expired"
      />
    )
  }

  if (phase === 'error') {
    return (
      <QrUnavailableState
        variant={variant}
        qrSize={qrSize}
        icon="alert-circle-outline"
        title={WALLET_HOME_COPY.myQrCreateErrorTitle}
        body={WALLET_HOME_COPY.myQrCreateErrorMessage}
        actionLabel={WALLET_HOME_COPY.myQrCreateErrorAction}
        onRetry={onRetry}
        testID="wallet-initiated-vp-qr-error"
      />
    )
  }

  return null
}
