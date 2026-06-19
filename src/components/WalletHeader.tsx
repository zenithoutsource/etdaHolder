import { Text, View } from 'react-native'

import { AppButton } from './AppButton'

type WalletHeaderProps = {
  title?: string
  onBack?: () => void
}

export function WalletHeader({ title = 'Wallet', onBack }: WalletHeaderProps) {
  return (
    <View className="h-[90px] flex-row items-center bg-wallet-navy px-5">
      {onBack ? (
        <AppButton
          variant="icon-circle"
          iconName="chevron-left"
          iconSize={28}
          iconColor="#ffffff"
          onPress={onBack}
          accessibilityLabel="Back"
          className="h-9 w-9 border border-white"
        />
      ) : (
        <View className="h-9 w-9" />
      )}
      <Text className="min-w-0 flex-1 text-center text-2xl font-semibold text-white">{title}</Text>
      <View className="h-9 w-9" />
    </View>
  )
}
