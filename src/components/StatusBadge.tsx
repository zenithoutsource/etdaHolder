import { Text, View } from 'react-native'

type StatusBadgeProps = {
  label: string
  className?: string
  textClassName?: string
  backgroundColor?: string
  color?: string
}

export function StatusBadge({
  label,
  className = 'bg-[#18a05d]',
  textClassName = 'text-[11px] font-semibold text-white',
  backgroundColor,
  color,
}: StatusBadgeProps) {
  return (
    <View
      className={`rounded-full px-2.5 py-1 ${className}`}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <Text className={textClassName} style={color ? { color } : undefined}>
        {label}
      </Text>
    </View>
  )
}
