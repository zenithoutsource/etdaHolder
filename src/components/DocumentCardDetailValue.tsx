/** Compact label/value pair for document-card columns. */

import { Text, View } from 'react-native'

type DocumentCardDetailValueProps = Readonly<{
  label: string
  value?: string
  expiry?: boolean
  testID?: string
  accessibilityLabel?: string
}>

export function DocumentCardDetailValue({
  label,
  value,
  expiry = false,
  testID,
  accessibilityLabel,
}: DocumentCardDetailValueProps) {
  const displayValue = value || '-'

  return (
    <View className="gap-0.5">
      <Text className={`text-[10px] leading-[14px] ${expiry ? 'text-danger' : 'text-blue-gray'}`}>
        {label}
      </Text>
      <Text
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        className={`text-[13px] font-bold leading-[18px] ${expiry ? 'text-danger' : 'text-wallet-navy'}`}
      >
        {displayValue}
      </Text>
    </View>
  )
}
