import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Pressable, Text, View } from 'react-native'

type WalletHeaderProps = {
  title?: string
  onBack?: () => void
}

export function WalletHeader({ title = 'Wallet', onBack }: WalletHeaderProps) {
  return (
    <View className="h-[90px] flex-row items-center bg-wallet-navy px-5">
      {onBack ? (
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-full border border-white"
          onPress={onBack}
          accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color="#ffffff" />
        </Pressable>
      ) : (
        <View className="h-9 w-9" />
      )}
      <Text className="min-w-0 flex-1 text-center text-2xl font-semibold text-white">{title}</Text>
      <View className="h-9 w-9" />
    </View>
  )
}
