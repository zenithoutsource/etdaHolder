import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { THEME } from '../config/themeColors'

export type PresentationDisclosureListItem = {
  key: string
  label: string
  value?: string
  selected?: boolean
  status?: 'verified' | 'used'
}

type PresentationDisclosureListProps = {
  items: PresentationDisclosureListItem[]
  variant?: 'consent' | 'review' | 'selectable' | 'result'
}

function readIconName(item: PresentationDisclosureListItem, variant: NonNullable<PresentationDisclosureListProps['variant']>) {
  if (variant === 'selectable') {
    return item.selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'
  }
  if (variant === 'result') return item.status === 'used' ? 'card-account-details-outline' : 'check-circle'
  if (variant === 'review') return 'checkbox-marked'
  return 'check-circle'
}

function readIconColor(item: PresentationDisclosureListItem, variant: NonNullable<PresentationDisclosureListProps['variant']>) {
  if (variant === 'selectable') return item.selected ? THEME.successDark : THEME.steel300
  if (variant === 'consent' || variant === 'result') return THEME.success
  return THEME.navyRoyal
}

export function PresentationDisclosureList({
  items,
  variant = 'review',
}: PresentationDisclosureListProps) {
  return (
    <View className="gap-2">
      {items.map((item) => {
        const selected = item.selected ?? true
        const textClassName = selected ? 'font-semibold text-ink' : 'text-blue-gray'
        const rowClassName =
          variant === 'review'
            ? 'flex-row items-center gap-3 rounded-xl border-l-4 border-navy-royal bg-white px-4 py-3'
            : 'flex-row items-center gap-3 rounded-xl bg-surface-soft px-4 py-4'

        return (
          <View
            key={item.key}
            className={rowClassName}
            style={
              variant === 'review'
                ? { elevation: 2, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }
                : undefined
            }
          >
            <MaterialCommunityIcons
              name={readIconName(item, variant)}
              size={variant === 'review' ? 22 : 24}
              color={readIconColor(item, variant)}
            />
            <View className="min-w-0 flex-1">
              <Text className={`text-[14px] ${variant === 'review' ? 'font-extrabold text-navy-deep' : textClassName}`}>
                {item.label}
              </Text>
              {item.value ? (
                <Text className={`text-[13px] ${variant === 'review' ? 'font-bold text-navy-royal' : 'text-gray500'}`}>
                  {item.value}
                </Text>
              ) : null}
            </View>
            {variant === 'review' ? (
              <MaterialCommunityIcons name="information-outline" size={20} color={THEME.grayCool} />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
