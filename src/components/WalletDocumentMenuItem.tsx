import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { StatusBadge } from './StatusBadge'

import { THEME } from '../config/themeColors'

type WalletDocumentMenuItemProps = {
  label: string
  icon: ImageSourcePropType
  iconStyle: { width: number; height: number }
  hasCredential: boolean
  isExpanded: boolean
  badge?: { label: string; className: string }
  requestLabel: string
  onPress: () => void
  oldCredentialLabel?: string
  onViewOldCredential?: () => void
  inactivePanelMessage?: string
  showRenewalCta?: boolean
  renewalCtaLabel?: string
  onRenewalRequest?: () => void
  showDocumentReissueCta?: boolean
  documentReissueCtaLabel?: string
  onDocumentReissue?: () => void
}

export function WalletDocumentMenuItem({
  label,
  icon,
  iconStyle,
  hasCredential,
  isExpanded,
  badge,
  requestLabel,
  onPress,
  oldCredentialLabel,
  onViewOldCredential,
  inactivePanelMessage,
  showRenewalCta = false,
  renewalCtaLabel,
  onRenewalRequest,
  showDocumentReissueCta = false,
  documentReissueCtaLabel,
  onDocumentReissue,
}: WalletDocumentMenuItemProps) {
  return (
    <View
      className={`relative mt-1 rounded-[14px] ${isExpanded ? 'bg-gray-panel px-[18px] pb-4 pt-4' : 'bg-white px-[18px] py-4'}`}
      style={{
        elevation: 2,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      }}
    >
      {badge ? (
        <View className="absolute -top-2 right-4 z-10">
          <StatusBadge label={badge.label} className={`${badge.className} px-3 py-1`} />
        </View>
      ) : null}
      <Pressable className="flex-row items-center gap-3.5 pb-3 pr-4 pt-3" onPress={onPress}>
        <View className="h-11 w-11 items-center justify-center">
          <Image source={icon} style={iconStyle} resizeMode="contain" />
        </View>
        <Text className="min-w-0 flex-1 text-base font-medium text-ink">
          {label}
        </Text>
        {hasCredential && !isExpanded ? (
          <MaterialCommunityIcons name="chevron-right" size={24} color={THEME.slate} />
        ) : !hasCredential ? (
          <View className="rounded-full bg-wallet-navy px-3.5 py-1.5">
            <Text className="text-[13px] font-medium text-white">{requestLabel}</Text>
          </View>
        ) : null}
      </Pressable>

      {onViewOldCredential && oldCredentialLabel ? (
        <View className="pt-2">
          <Pressable onPress={onViewOldCredential} className="items-center py-1">
            <Text className="text-xs font-semibold text-navy">{oldCredentialLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      {isExpanded && inactivePanelMessage ? (
        <View className="items-center pt-3">
          <View className="h-12 w-12 items-center justify-center rounded-full border-2 border-wallet-navy">
            <MaterialCommunityIcons name="lock-outline" size={28} color={THEME.navy} />
          </View>
          <Text className="mt-2 text-center text-xs text-gray600">{inactivePanelMessage}</Text>
          {showRenewalCta && renewalCtaLabel && onRenewalRequest ? (
            <AppButton
              variant="solid-block"
              label={renewalCtaLabel}
              onPress={onRenewalRequest}
              className="mt-3 min-w-[142px] px-5 py-2"
              textClassName="text-center text-xs font-bold"
            />
          ) : null}
          {showDocumentReissueCta && documentReissueCtaLabel && onDocumentReissue ? (
            <AppButton
              variant="solid-block"
              label={documentReissueCtaLabel}
              onPress={onDocumentReissue}
              className="mt-3 min-w-[142px] px-5 py-2"
              textClassName="text-center text-xs font-bold"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
