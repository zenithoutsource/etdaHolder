import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Pressable, Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import type { RenewalCleanupPendingItem } from '../services/credentials/renewalCleanupNotification'

import { THEME } from '../config/themeColors'

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
      className="rounded-[14px] border border-success-pale bg-success-tint px-4 py-4"
      style={{
        elevation: 2,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons name="check-circle-outline" size={24} color={THEME.success} />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-ink">
            {WALLET_HOME_COPY.renewalReceivedTitle}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-gray600">
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
          <MaterialCommunityIcons name="close" size={20} color={THEME.slate} />
        </Pressable>
      </View>
    </View>
  )
}
