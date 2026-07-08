import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'

import { THEME } from '../../config/themeColors'

type WaitingForTapPanelProps = {
  onCancel: () => void
}

export function WaitingForTapPanel({ onCancel }: WaitingForTapPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="nfc-search-variant" size={56} color={THEME.navy} />
        <Text className="mt-4 text-center text-lg font-semibold text-ink">
          Waiting for Tap...
        </Text>
        <Text className="mt-2 text-center text-sm text-slate">
          Hold your phone near the reader
        </Text>
      </View>
      <AppButton
        variant="outline-block"
        label="Cancel"
        onPress={onCancel}
        className="mt-6 border-slate200 py-3"
        textClassName="text-center text-sm font-semibold text-ink"
      />
    </View>
  )
}
