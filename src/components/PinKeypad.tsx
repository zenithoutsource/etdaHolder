import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Pressable, Text, View } from 'react-native'

import { THEME } from '../config/themeColors'

type PinKeypadProps = {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onFingerprint: () => void
  showFingerprint?: boolean
  digitsDisabled?: boolean
}

const KEY_CLASS_NAME =
  'h-[58px] w-[74px] items-center justify-center rounded-[10px] border border-blue-gray bg-white'

const digitRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

export function PinKeypad({
  onDigit,
  onBackspace,
  onFingerprint,
  showFingerprint = true,
  digitsDisabled = false,
}: PinKeypadProps) {
  return (
    <View className="mt-8 w-full max-w-[270px] flex-row flex-wrap justify-center gap-3">
      {digitRows.flat().map((digit) => (
        <Pressable
          key={digit}
          testID={`pin-key-${digit}`}
          className={`${KEY_CLASS_NAME}${digitsDisabled ? ' opacity-40' : ''}`}
          disabled={digitsDisabled}
          onPress={() => onDigit(digit)}
        >
          <Text className="text-xl font-semibold text-ink">{digit}</Text>
        </Pressable>
      ))}
      {showFingerprint ? (
        <Pressable
          testID="pin-key-fingerprint"
          className={KEY_CLASS_NAME}
          onPress={onFingerprint}
          accessibilityLabel="Use biometric (face or fingerprint)"
        >
          <MaterialCommunityIcons name="fingerprint" size={28} color={THEME.navy} />
        </Pressable>
      ) : (
        <View className={KEY_CLASS_NAME} />
      )}
      <Pressable
        testID="pin-key-0"
        className={`${KEY_CLASS_NAME}${digitsDisabled ? ' opacity-40' : ''}`}
        disabled={digitsDisabled}
        onPress={() => onDigit('0')}
      >
        <Text className="text-xl font-semibold text-ink">0</Text>
      </Pressable>
      <Pressable
        testID="pin-key-backspace"
        className={`${KEY_CLASS_NAME}${digitsDisabled ? ' opacity-40' : ''}`}
        disabled={digitsDisabled}
        onPress={onBackspace}
        accessibilityLabel="Delete last digit"
      >
        <MaterialCommunityIcons name="backspace-outline" size={22} color={THEME.ink} />
      </Pressable>
    </View>
  )
}
