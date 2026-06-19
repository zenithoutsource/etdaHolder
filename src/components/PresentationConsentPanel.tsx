import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { ScrollView, Text, View } from 'react-native'

import type { ResolvedPresentationRequest } from '../services/vp/presentationService'
import { AppButton } from './AppButton'

type Props = {
  request: ResolvedPresentationRequest
  onAccept: () => void
  onReject: () => void
}

export function PresentationConsentPanel({ request, onAccept, onReject }: Props) {
  return (
    <View className="flex-1 bg-white px-6 pt-8">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32, alignItems: 'center' }}>
        <View className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-[#1a3a7a]">
          <MaterialCommunityIcons name="glass-cocktail" size={36} color="#ffffff" />
        </View>

        <Text className="mt-5 text-center text-[18px] font-extrabold text-[#071f5f]">
          ข้อมูลที่{request.verifier.name}ต้องการ
        </Text>

        <Text className="mt-1 text-[13px] text-[#6b7280]">ข้อมูลที่ร้องขอ</Text>

        <View className="mt-5 w-full gap-3">
          {request.disclosures.map((disclosure) => (
            <View key={disclosure.key} className="flex-row items-center justify-between rounded-xl bg-[#f4f6fa] px-4 py-4">
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-[#071f5f]">{disclosure.label}</Text>
                <Text className="text-[13px] text-[#6b7280]">{disclosure.value}</Text>
              </View>
              <MaterialCommunityIcons name="check-circle" size={24} color="#18a05d" />
            </View>
          ))}
        </View>

        <View className="mt-8 w-full flex-row items-center gap-2 rounded-xl bg-[#f4f6fa] px-4 py-3">
          <MaterialCommunityIcons name="face-recognition" size={22} color="#071f5f" />
          <Text className="text-[13px] font-bold text-[#071f5f]">ต้องใช้การยืนยันตัวตนโดย{'\n'}Face ID</Text>
        </View>

        <AppButton variant="solid-block" label="รับทราบและยินยอมส่งข้อมูล" onPress={onAccept} className="mt-8 w-full py-4" />
        <AppButton
          variant="icon-circle"
          label="ไม่ยินยอม"
          onPress={onReject}
          className="mt-3 w-full rounded-xl border border-[#d1d5db] bg-white py-4"
          textClassName="text-[15px] font-bold text-[#364152]"
        />
      </ScrollView>
    </View>
  )
}
