import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Pressable, Text, View } from 'react-native'

import { THEME } from '../config/themeColors'

export type PresentationDisclosureListItem = {
  key: string
  label: string
  value?: string
  selected?: boolean
  status?: 'verified' | 'used'
  /** When false the row is read-only (mandatory disclosure). */
  toggleable?: boolean
}

type PresentationDisclosureListProps = {
  items: PresentationDisclosureListItem[]
  variant?: 'consent' | 'review' | 'selectable' | 'result'
  onToggle?: (key: string) => void
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

function readItemVariant(
  item: PresentationDisclosureListItem,
  variant: NonNullable<PresentationDisclosureListProps['variant']>,
): NonNullable<PresentationDisclosureListProps['variant']> {
  if (variant === 'consent' && item.toggleable !== false) return 'selectable'
  return variant
}

function isSelectableRow(
  item: PresentationDisclosureListItem,
  itemVariant: NonNullable<PresentationDisclosureListProps['variant']>,
  onToggle?: (key: string) => void,
): boolean {
  return itemVariant === 'selectable' && item.toggleable !== false && Boolean(onToggle)
}

export function PresentationDisclosureList({
  items,
  variant = 'review',
  onToggle,
}: PresentationDisclosureListProps) {
  return (
    <View className="gap-2">
      {items.map((item) => {
        const itemVariant = readItemVariant(item, variant)
        const selected = item.selected ?? true
        const textClassName = selected ? 'font-semibold text-ink' : 'text-blue-gray'
        const rowClassName =
          itemVariant === 'review'
            ? 'flex-row items-center gap-3 rounded-xl border-l-4 border-navy-royal bg-white px-4 py-3'
            : 'flex-row items-center gap-3 rounded-xl bg-surface-soft px-4 py-4'
        const rowStyle =
          itemVariant === 'review'
            ? { elevation: 2, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }
            : undefined
        const selectable = isSelectableRow(item, itemVariant, onToggle)

        const content = (
          <>
            <MaterialCommunityIcons
              name={readIconName(item, itemVariant)}
              size={itemVariant === 'review' ? 22 : 24}
              color={readIconColor(item, itemVariant)}
            />
            <View className="min-w-0 flex-1">
              <Text className={`text-[14px] ${itemVariant === 'review' ? 'font-extrabold text-navy-deep' : textClassName}`}>
                {item.label}
              </Text>
              {item.value ? (
                <Text className={`text-[13px] ${itemVariant === 'review' ? 'font-bold text-navy-royal' : 'text-gray500'}`}>
                  {item.value}
                </Text>
              ) : null}
            </View>
            {itemVariant === 'review' ? (
              <MaterialCommunityIcons name="information-outline" size={20} color={THEME.grayCool} />
            ) : null}
          </>
        )

        if (selectable) {
          return (
            <Pressable
              key={item.key}
              className={rowClassName}
              style={rowStyle}
              onPress={() => onToggle?.(item.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={item.label}
            >
              {content}
            </Pressable>
          )
        }

        return (
          <View key={item.key} className={rowClassName} style={rowStyle}>
            {content}
          </View>
        )
      })}
    </View>
  )
}
