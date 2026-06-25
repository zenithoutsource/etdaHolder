import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'
import { formatMdocFieldLabel } from '@/src/services/proximity/mdocParser'

type ConsentPanelProps = {
  requestedFields: string[]
  availableFields: string[]
  onAllow: () => void
  onDeny: () => void
  isSubmitting?: boolean
}

export function ConsentPanel({
  requestedFields,
  availableFields,
  onAllow,
  onDeny,
  isSubmitting = false,
}: ConsentPanelProps) {
  const requested = new Set(requestedFields)

  return (
    <View className="rounded-[12px] bg-white px-5 py-6">
      <Text className="text-center text-lg font-semibold text-[#1a2a42]">
        Share credential data?
      </Text>
      <Text className="mt-2 text-center text-sm text-[#6d7a8d]">
        The reader requested the fields below
      </Text>

      <View className="mt-5 gap-3">
        {availableFields.map((fieldKey) => {
          const isRequested = requested.has(fieldKey)
          return (
            <View key={fieldKey} className="flex-row items-center gap-3 rounded-[8px] bg-[#f7f9fc] px-3 py-3">
              <MaterialCommunityIcons
                name={isRequested ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={20}
                color={isRequested ? '#0f8f4b' : '#b7c0cc'}
              />
              <Text className={`flex-1 text-sm ${isRequested ? 'font-semibold text-[#1a2a42]' : 'text-[#8a9bb0]'}`}>
                {formatMdocFieldLabel(fieldKey)}
              </Text>
            </View>
          )
        })}
      </View>

      <View className="mt-6 flex-row gap-3">
        <AppButton
          variant="solid-block"
          label="Allow"
          onPress={onAllow}
          loading={isSubmitting}
          disabled={isSubmitting}
          className="flex-1 border-0 bg-wallet-navy py-3"
          textClassName="text-center text-sm font-bold"
        />
        <AppButton
          variant="outline-block"
          label="Deny"
          onPress={onDeny}
          disabled={isSubmitting}
          className="flex-1 border-[#d0d7e2] py-3"
          textClassName="text-center text-sm font-semibold text-[#1a2a42]"
        />
      </View>
    </View>
  )
}
