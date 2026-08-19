/**
 * Pre-tap fixed disclosure consent from the reader profile (no toggles).
 * Journey: P4 NFC Present (app/(tabs)/present.tsx).
 * Copy: readerProfiles; cardSchemas disclosure labels.
 * Layout: PresentationDisclosureList.
 * Map: docs/CODEMAPS/frontend.md#present-and-nfc
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'
import { PresentationDisclosureList } from '@/src/components/PresentationDisclosureList'
import { resolvePresentationDisclosureLabel } from '@/src/config/cardSchemas'
import type { ReaderProfile } from '@/src/config/readerProfiles'
import { THEME } from '@/src/config/themeColors'

type PreTapConsentPanelProps = {
  profile: ReaderProfile
  onAccept: () => void
  onDecline: () => void
  submitting?: boolean
}

export function PreTapConsentPanel({
  profile,
  onAccept,
  onDecline,
  submitting,
}: PreTapConsentPanelProps) {
  const items = profile.mdocFields.map((field) => ({
    key: `${field.namespace}.${field.identifier}`,
    label: resolvePresentationDisclosureLabel(profile.documentType, field.identifier),
    selected: true,
    toggleable: false as const,
  }))

  return (
    <View className="rounded-[12px] bg-white px-6 py-8">
      <View className="items-center">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-navy-muted">
          <MaterialCommunityIcons name="car" size={36} color={THEME.white} />
        </View>

        <Text className="mt-5 text-center text-[18px] font-extrabold text-navy-deep">
          ข้อมูลที่เครื่องอ่านต้องการ
        </Text>
        <Text className="mt-1 text-[13px] text-gray500">ข้อมูลที่ร้องขอ</Text>
      </View>

      <View className="mt-5 w-full">
        <PresentationDisclosureList items={items} variant="consent" />
      </View>

      <View className="mt-8 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
        <MaterialCommunityIcons name="face-recognition" size={22} color={THEME.navyDeep} />
        <Text className="flex-1 text-[13px] font-bold text-navy-deep">
          ต้องใช้การยืนยันตัวตนโดย Face ID{'\n'}เมื่อแตะเครื่องอ่าน
        </Text>
      </View>

      <AppButton
        variant="solid-block"
        label="รับทราบและยินยอมส่งข้อมูล"
        onPress={onAccept}
        loading={submitting}
        className="mt-8 w-full py-4"
      />
      <AppButton
        variant="outline-block"
        label="ไม่ยินยอม"
        onPress={onDecline}
        className="mt-3 w-full rounded-full border-gray300 py-4"
        textClassName="text-[15px] font-bold text-slate750"
      />
    </View>
  )
}
