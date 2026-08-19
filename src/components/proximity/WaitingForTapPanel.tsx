/**
 * Preparing / waiting-for-NFC-tap UI with cancel.
 * Journey: P4 NFC Present (tap-only; no holder QR).
 * Copy: inline Thai (not extracted).
 * Map: docs/CODEMAPS/frontend.md#present-and-nfc
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'

import { THEME } from '../../config/themeColors'

type WaitingForTapPanelProps = {
  preparing?: boolean
  onCancel: () => void
}

export function WaitingForTapPanel({
  preparing = false,
  onCancel,
}: WaitingForTapPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="nfc-search-variant" size={56} color={THEME.navy} />
        <Text className="mt-4 text-center text-lg font-semibold text-ink">
          {preparing ? 'กำลังเตรียม NFC…' : 'รอการแตะเครื่องอ่าน...'}
        </Text>
        <Text className="mt-2 text-center text-sm text-slate">
          {preparing
            ? 'กรุณาเปิดหน้านี้ค้างไว้ จนกว่า NFC จะพร้อม'
            : 'กรุณาเปิดหน้านี้ค้างไว้ วางโทรศัพท์ให้นิ่ง \n บนเครื่องอ่าน NFC ห้ามยกขึ้นกลางคัน'}
        </Text>
      </View>
      <AppButton
        variant="outline-block"
        label="ยกเลิก"
        onPress={onCancel}
        className="mt-6 border-slate200 py-3"
        textClassName="text-center text-sm font-semibold text-ink"
      />
    </View>
  )
}
