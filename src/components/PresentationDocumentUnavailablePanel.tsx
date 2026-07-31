import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { THEME } from '../config/themeColors'

type Props = {
  documentLabel: string
  presentationOrigin: 'scanned-verifier-qr' | 'wallet-generated-qr'
  onBack: () => void
  onRequest?: () => void
}

export function PresentationDocumentUnavailablePanel({
  documentLabel,
  presentationOrigin,
  onBack,
  onRequest,
}: Props) {
  const returnLabel = presentationOrigin === 'wallet-generated-qr'
    ? 'กลับไปที่ My QR'
    : 'กลับไปที่ Wallet'

  return (
    <View
      testID="presentation-document-unavailable"
      className="flex-1 items-center bg-wallet-bg px-6 pt-16"
    >
      <View className="h-24 w-24 items-center justify-center rounded-full bg-white">
        <MaterialCommunityIcons
          name="file-search-outline"
          size={52}
          color={THEME.navy}
        />
      </View>

      <Text className="mt-7 text-center text-xl font-extrabold leading-7 text-ink">
        ไม่พบเอกสารที่ใช้ยืนยัน
      </Text>
      <Text className="mt-3 text-center text-sm leading-6 text-gray600">
        ผู้ตรวจสอบขอเอกสารนี้ แต่ยังไม่มีเอกสารใน Wallet ของคุณ
      </Text>

      <View className="mt-6 w-full rounded-2xl border border-slate200 bg-white px-5 py-4">
        <Text className="text-center text-xs font-semibold text-gray600">
          เอกสารที่ผู้ตรวจสอบร้องขอ
        </Text>
        <Text className="mt-1 text-center text-base font-bold text-wallet-navy">
          {documentLabel}
        </Text>
      </View>

      {onRequest ? (
        <AppButton
          testID="presentation-document-unavailable-request"
          variant="solid-block"
          label="ขอเอกสาร"
          onPress={onRequest}
          fullWidth
          className="mt-8 rounded-xl py-4"
          textClassName="text-center text-sm font-bold"
        />
      ) : null}
      <AppButton
        testID="presentation-document-unavailable-back"
        variant="outline-block"
        label={returnLabel}
        onPress={onBack}
        fullWidth
        className="mt-3 rounded-xl py-4"
        textClassName="text-center text-sm font-bold"
      />
    </View>
  )
}
