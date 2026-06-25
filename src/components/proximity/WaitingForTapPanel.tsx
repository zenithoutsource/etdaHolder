import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'

type WaitingForTapPanelProps = {
  onCancel: () => void
}

export function WaitingForTapPanel({ onCancel }: WaitingForTapPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="nfc-search-variant" size={56} color="#002887" />
        <Text className="mt-4 text-center text-lg font-semibold text-[#1a2a42]">
          Waiting for Tap...
        </Text>
        <Text className="mt-2 text-center text-sm text-[#6d7a8d]">
          Hold your phone near the reader
        </Text>
      </View>
      <AppButton
        variant="outline-block"
        label="Cancel"
        onPress={onCancel}
        className="mt-6 border-[#d0d7e2] py-3"
        textClassName="text-center text-sm font-semibold text-[#1a2a42]"
      />
    </View>
  )
}
