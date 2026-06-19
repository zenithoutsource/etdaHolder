import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import type { PresentationDisclosure } from '../services/vp/presentationService'

type Props = {
  disclosures: PresentationDisclosure[]
  onAccept: () => void
}

export function PresentationRequestedItemsCard({ disclosures, onAccept }: Props) {
  return (
    <View>
      <Text className="text-[13px] font-extrabold text-[#071f5f]">รายการที่ร้องขอ</Text>
      <View className="mt-2 gap-2">
        {disclosures.map((disclosure) => (
          <View
            key={disclosure.key}
            className="flex-row items-center gap-3 rounded-xl border-l-4 border-[#123b8c] bg-white px-4 py-3"
            style={{ elevation: 2, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }}>
            <MaterialCommunityIcons name="checkbox-marked" size={22} color="#123b8c" />
            <View className="flex-1">
              <Text className="text-[14px] font-extrabold text-[#071f5f]">{disclosure.label}</Text>
              <Text className="text-[13px] font-bold text-[#123b8c]">{disclosure.value}</Text>
            </View>
            <MaterialCommunityIcons name="information-outline" size={20} color="#9aa1ad" />
          </View>
        ))}
      </View>
      <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-12" />
    </View>
  )
}
