import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Pressable, Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import type { RenewalCleanupPendingItem } from '../services/credentials/renewalCleanupNotification'

type CredentialRenewalCleanupBannerProps = {
  item: RenewalCleanupPendingItem
  onCleanup: (oldCredentialId: string, replacementCredentialId?: string) => void
  onDismiss: (oldCredentialId: string) => void
}

export function CredentialRenewalCleanupBanner({
  item,
  onCleanup,
  onDismiss,
}: CredentialRenewalCleanupBannerProps) {
  return (
    <View
      testID="renewal-cleanup-banner"
      className="rounded-[14px] border border-[#b8e6cc] bg-[#e8f8ef] px-4 py-4"
      style={{
        elevation: 2,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons name="check-circle-outline" size={24} color="#18a05d" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-[#1a2a42]">
            {WALLET_HOME_COPY.renewalReceivedTitle}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-[#4b5563]">
            {WALLET_HOME_COPY.renewalReceivedMessage}
          </Text>
          <AppButton
            variant="solid-block"
            label={WALLET_HOME_COPY.renewalCleanupCta}
            onPress={() => {
              onCleanup(item.oldCredentialId, item.replacementCredentialId)
            }}
            className="mt-3 rounded-xl py-2.5"
            textClassName="text-center text-xs font-bold"
          />
        </View>
        <Pressable
          accessibilityLabel="Dismiss renewal notification"
          onPress={() => {
            onDismiss(item.oldCredentialId)
          }}
          className="p-1">
          <MaterialCommunityIcons name="close" size={20} color="#6d7a8d" />
        </Pressable>
      </View>
    </View>
  )
}
