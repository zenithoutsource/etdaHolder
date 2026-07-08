import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from './AppButton'
import { WalletHeader } from './WalletHeader'

import { THEME } from '../config/themeColors'

type IssuerSuspensionAckOverlayProps = {
  title: string
  onAcknowledge: () => void
  onBack: () => void
}

export function IssuerSuspensionAckOverlay({
  title,
  onAcknowledge,
  onBack,
}: IssuerSuspensionAckOverlayProps) {
  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="Suspended Document" onBack={onBack} />
      <View className="flex-1 bg-surface px-5 pt-8">
        <View className="rounded-[24px] border border-slate150 bg-slate110 px-6 py-8">
          <View className="items-center rounded-[20px] border border-dashed border-slate350 bg-slate250 px-5 py-8">
            <MaterialCommunityIcons name="file-lock-outline" size={52} color={THEME.steel600} />
            <Text className="mt-4 text-center text-2xl font-semibold text-ink">
              Document suspended
            </Text>
            <Text className="mt-3 text-center text-base font-semibold text-slate800">
              {title}
            </Text>
            <Text className="mt-3 text-center text-sm leading-6 text-gray600">
              This credential was suspended by the issuer and must be acknowledged before other revoke actions continue.
            </Text>
          </View>
        </View>

        <AppButton
          variant="solid-block"
          label="รับทราบการระงับ"
          onPress={onAcknowledge}
          className="mt-8 rounded-[18px] py-4"
          textClassName="text-center text-base font-bold"
        />
        <AppButton
          variant="outline-block"
          label="Back"
          onPress={onBack}
          className="mt-3 rounded-[18px] py-4"
          textClassName="text-center text-base font-bold"
        />
      </View>
    </SafeAreaView>
  )
}
