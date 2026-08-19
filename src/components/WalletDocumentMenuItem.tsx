/**
 * Expandable home document row (request, renew, reissue, key-expired).
 * Journey: P1 home; P3 / P6 inactive CTAs.
 * Copy: props plus badges; embeds WalletKeyExpiredActionPanel.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { StatusBadge } from './StatusBadge'
import { WalletKeyExpiredActionPanel } from './WalletKeyExpiredActionPanel'

import { THEME } from '../config/themeColors'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'

type WalletDocumentMenuItemProps = {
  label: string
  icon: ImageSourcePropType
  iconStyle: { width: number; height: number }
  hasCredential: boolean
  isExpanded: boolean
  badge?: { label: string; className: string }
  requestLabel: string
  onPress: () => void
  onToggleExpand?: () => void
  oldCredentialLabel?: string
  onViewOldCredential?: () => void
  inactivePanelMessage?: string
  showRenewalCta?: boolean
  renewalCtaLabel?: string
  onRenewalRequest?: () => void
  showReceiveRenewalCta?: boolean
  receiveRenewalCtaLabel?: string
  onReceiveRenewal?: () => void
  isReceivingRenewal?: boolean
  showDocumentReissueCta?: boolean
  documentReissueCtaLabel?: string
  onDocumentReissue?: () => void
  showWalletKeyExpiredPrompt?: boolean
  isRotatingWalletKey?: boolean
  onCreateWalletKey?: () => void
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
  onToggleExpand,
  oldCredentialLabel,
  onViewOldCredential,
  inactivePanelMessage,
  showRenewalCta = false,
  renewalCtaLabel,
  onRenewalRequest,
  showReceiveRenewalCta = false,
  receiveRenewalCtaLabel,
  onReceiveRenewal,
  isReceivingRenewal = false,
  showDocumentReissueCta = false,
  documentReissueCtaLabel,
  onDocumentReissue,
  showWalletKeyExpiredPrompt = false,
  isRotatingWalletKey = false,
  onCreateWalletKey,
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
      <View className="flex-row items-center pb-3 pt-3">
        <Pressable
          className="min-w-0 flex-1 flex-row items-center gap-3.5 pr-2"
          onPress={onPress}
          accessibilityRole="button"
        >
          <View className="h-11 w-11 items-center justify-center">
            <Image source={icon} style={iconStyle} resizeMode="contain" />
          </View>
          <Text className="min-w-0 flex-1 text-base font-medium text-ink">
            {label}
          </Text>
          {hasCredential && !isExpanded && !onToggleExpand ? (
            <MaterialCommunityIcons name="chevron-right" size={24} color={THEME.slate} />
          ) : !hasCredential ? (
            <View className="rounded-full bg-wallet-navy px-3.5 py-1.5">
              <Text className="text-[13px] font-medium text-white">{requestLabel}</Text>
            </View>
          ) : null}
        </Pressable>
        {onToggleExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isExpanded ? WALLET_HOME_COPY.collapseDocument : WALLET_HOME_COPY.expandDocument
            }
            onPress={onToggleExpand}
            className="h-11 w-11 items-center justify-center"
          >
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={THEME.slate}
            />
          </Pressable>
        ) : null}
      </View>

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
          {showWalletKeyExpiredPrompt && onCreateWalletKey ? (
            <WalletKeyExpiredActionPanel
              isRotating={isRotatingWalletKey}
              onCreateNewKey={onCreateWalletKey}
              className="mt-3 w-full rounded-xl bg-amber-tint px-4 py-4"
            />
          ) : null}
          {showRenewalCta && renewalCtaLabel && onRenewalRequest ? (
            <AppButton
              variant="solid-block"
              label={renewalCtaLabel}
              onPress={onRenewalRequest}
              className="mt-3 min-w-[142px] px-5 py-2"
              textClassName="text-center text-xs font-bold"
            />
          ) : null}
          {showReceiveRenewalCta && receiveRenewalCtaLabel && onReceiveRenewal ? (
            <AppButton
              variant="solid-block"
              label={receiveRenewalCtaLabel}
              onPress={onReceiveRenewal}
              loading={isReceivingRenewal}
              disabled={isReceivingRenewal}
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
