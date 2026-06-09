import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Pressable, Text, View } from 'react-native'

type PinKeypadProps = {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onFingerprint: () => void
  showFingerprint?: boolean
}

const KEY_CLASS_NAME =
  'h-[58px] w-[74px] items-center justify-center rounded-[10px] border border-[#8a9bb0] bg-white'

const digitRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

export function PinKeypad({ onDigit, onBackspace, onFingerprint, showFingerprint = true }: PinKeypadProps) {
  return (
    <View className="mt-8 w-full max-w-[270px] flex-row flex-wrap justify-center gap-3">
      {digitRows.flat().map((digit) => (
        <Pressable
          key={digit}
          testID={`pin-key-${digit}`}
          className={KEY_CLASS_NAME}
          onPress={() => onDigit(digit)}
        >
          <Text className="text-xl font-semibold text-[#1a2a42]">{digit}</Text>
        </Pressable>
      ))}
      {showFingerprint ? (
        <Pressable
          testID="pin-key-fingerprint"
          className={KEY_CLASS_NAME}
          onPress={onFingerprint}
          accessibilityLabel="Use fingerprint"
        >
          <MaterialCommunityIcons name="fingerprint" size={28} color="#002887" />
        </Pressable>
      ) : (
        <View className={KEY_CLASS_NAME} />
      )}
      <Pressable
        testID="pin-key-0"
        className={KEY_CLASS_NAME}
        onPress={() => onDigit('0')}
      >
        <Text className="text-xl font-semibold text-[#1a2a42]">0</Text>
      </Pressable>
      <Pressable
        testID="pin-key-backspace"
        className={KEY_CLASS_NAME}
        onPress={onBackspace}
        accessibilityLabel="Delete last digit"
      >
        <MaterialCommunityIcons name="backspace-outline" size={22} color="#1a2a42" />
      </Pressable>
    </View>
  )
}
