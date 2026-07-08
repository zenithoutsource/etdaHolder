import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { ScrollView, Text, View } from 'react-native'

import type { ResolvedPresentationRequest } from '../services/vp/presentationService'
import { AppButton } from './AppButton'
import { PresentationDisclosureList } from './PresentationDisclosureList'

import { THEME } from '../config/themeColors'

type Props = {
  request: ResolvedPresentationRequest
  onAccept: () => void
  onReject: () => void
  disabled?: boolean
}

export function PresentationConsentPanel({ request, onAccept, onReject, disabled }: Props) {
  return (
    <View className="flex-1 bg-white px-6 pt-8">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8 items-center">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-navy-muted">
          <MaterialCommunityIcons name="glass-cocktail" size={36} color={THEME.white} />
        </View>

        <Text className="mt-5 text-center text-[18px] font-extrabold text-navy-deep">
          ข้อมูลที่{request.verifier.name}ต้องการ
        </Text>

        <Text className="mt-1 text-[13px] text-gray500">ข้อมูลที่ร้องขอ</Text>

        <View className="mt-5 w-full">
          <PresentationDisclosureList items={request.disclosures} variant="consent" />
        </View>

        <View className="mt-8 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
          <MaterialCommunityIcons name="face-recognition" size={22} color={THEME.navyDeep} />
          <Text className="text-[13px] font-bold text-navy-deep">ต้องใช้การยืนยันตัวตนโดย{'\n'}Face ID</Text>
        </View>

        <AppButton variant="solid-block" label="รับทราบและยินยอมส่งข้อมูล" onPress={onAccept} disabled={disabled} className="mt-8 w-full py-4" />
        <AppButton
          variant="icon-circle"
          label="ไม่ยินยอม"
          onPress={onReject}
          disabled={disabled}
          className="mt-3 w-full rounded-xl border border-gray300 bg-white py-4"
          textClassName="text-[15px] font-bold text-slate750"
        />
      </ScrollView>
    </View>
  )
}
