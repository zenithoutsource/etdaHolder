import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

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
  if (variant === 'selectable') return item.selected ? '#0f8f4b' : '#b7c0cc'
  if (variant === 'consent' || variant === 'result') return '#18a05d'
  return '#123b8c'
}

export function PresentationDisclosureList({
  items,
  variant = 'review',
}: PresentationDisclosureListProps) {
  return (
    <View className="gap-2">
      {items.map((item) => {
        const selected = item.selected ?? true
        const textClassName = selected ? 'font-semibold text-[#1a2a42]' : 'text-[#8a9bb0]'
        const rowClassName =
          variant === 'review'
            ? 'flex-row items-center gap-3 rounded-xl border-l-4 border-[#123b8c] bg-white px-4 py-3'
            : 'flex-row items-center gap-3 rounded-xl bg-[#f4f6fa] px-4 py-4'

        return (
          <View
            key={item.key}
            className={rowClassName}
            style={
              variant === 'review'
                ? { elevation: 2, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }
                : undefined
            }
          >
            <MaterialCommunityIcons
              name={readIconName(item, variant)}
              size={variant === 'review' ? 22 : 24}
              color={readIconColor(item, variant)}
            />
            <View className="min-w-0 flex-1">
              <Text className={`text-[14px] ${variant === 'review' ? 'font-extrabold text-[#071f5f]' : textClassName}`}>
                {item.label}
              </Text>
              {item.value ? (
                <Text className={`text-[13px] ${variant === 'review' ? 'font-bold text-[#123b8c]' : 'text-[#6b7280]'}`}>
                  {item.value}
                </Text>
              ) : null}
            </View>
            {variant === 'review' ? (
              <MaterialCommunityIcons name="information-outline" size={20} color="#9aa1ad" />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
