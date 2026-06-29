import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { PinKeypad } from '../PinKeypad'

const PIN_LENGTH = 6

type PinEntryStepProps = {
  title: string
  subtitle: string
  pin: string
  error?: string | null
  onDigit: (digit: string) => void
  onBackspace: () => void
  showFingerprint?: boolean
  onFingerprint?: () => void
}

export function PinEntryStep({
  title,
  subtitle,
  pin,
  error,
  onDigit,
  onBackspace,
  showFingerprint = false,
  onFingerprint = () => {},
}: PinEntryStepProps) {
  return (
    <View className="w-full items-center">
      <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
      <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">{title}</Text>
      <Text className="mt-2 text-center text-xs text-[#8a9bb0]">{subtitle}</Text>
      <View className="mt-7 flex-row gap-3">
        {Array.from({ length: PIN_LENGTH }).map((_, index) => (
          <View
            key={index}
            className={`h-3 w-3 rounded-full ${index < pin.length ? 'bg-black' : 'border border-[#8a9bb0]'}`}
          />
        ))}
      </View>
      {error ? (
        <Text className="mt-4 text-center text-sm font-medium text-[#c00000]">{error}</Text>
      ) : null}
      <PinKeypad
        onDigit={onDigit}
        onBackspace={onBackspace}
        onFingerprint={onFingerprint}
        showFingerprint={showFingerprint}
      />
    </View>
  )
}

export const AUTH_PIN_LENGTH = PIN_LENGTH
