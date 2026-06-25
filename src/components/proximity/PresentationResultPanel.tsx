import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'
import { formatMdocFieldLabel } from '@/src/services/proximity/mdocParser'

type PresentationResultPanelProps = {
  sharedFields: string[]
  onDone: () => void
}

export function PresentationResultPanel({ sharedFields, onDone }: PresentationResultPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="check-circle" size={56} color="#0f8f4b" />
        <Text className="mt-4 text-center text-lg font-semibold text-[#1a2a42]">
          Success!
        </Text>
        <Text className="mt-2 text-center text-sm text-[#6d7a8d]">
          Shared {sharedFields.length} field{sharedFields.length === 1 ? '' : 's'}
        </Text>
      </View>

      <View className="mt-5 gap-2">
        {sharedFields.map((fieldKey) => (
          <Text key={fieldKey} className="text-center text-sm font-medium text-[#1a2a42]">
            {formatMdocFieldLabel(fieldKey)}
          </Text>
        ))}
      </View>

      <AppButton
        variant="solid-block"
        label="Done"
        onPress={onDone}
        className="mt-6 border-0 bg-wallet-navy py-3"
        textClassName="text-center text-sm font-bold"
      />
    </View>
  )
}
