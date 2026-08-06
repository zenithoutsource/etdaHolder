import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'

type WalletKeyExpiredActionPanelProps = {
  isRotating?: boolean
  onCreateNewKey: () => void
  className?: string
}

export function WalletKeyExpiredActionPanel({
  isRotating = false,
  onCreateNewKey,
  className = 'mt-4 rounded-xl bg-amber-tint px-4 py-4',
}: WalletKeyExpiredActionPanelProps) {
  return (
    <View className={className}>
      <Text className="text-center text-base font-bold text-amber800">
        {WALLET_HOME_COPY.walletKeyExpiredTitle}
      </Text>
      <Text className="mt-2 text-center text-sm text-amber800">
        {WALLET_HOME_COPY.walletKeyExpiredMessage}
      </Text>
      <AppButton
        variant="solid-block"
        label={WALLET_HOME_COPY.createNewWalletKey}
        onPress={onCreateNewKey}
        disabled={isRotating}
        loading={isRotating}
        className="mt-4 w-full rounded-xl py-3"
        textClassName="text-center text-sm font-bold"
      />
    </View>
  )
}
