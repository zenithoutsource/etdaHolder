import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { CodeBoxField } from './auth/CodeBoxField'
import { PinKeypad } from './PinKeypad'

export const PIN_ENTRY_LENGTH = 6

type PinEntrySurfaceProps = {
  title: string
  subtitle: string
  pin: string
  error?: string | null
  status?: string | null
  showFingerprint?: boolean
  allowPaste?: boolean
  pinLength?: number
  inputDisabled?: boolean
  onDigit: (digit: string) => void
  onBackspace: () => void
  onFingerprint?: () => void
  onFill?: (code: string) => void
}

export function PinEntrySurface({
  title,
  subtitle,
  pin,
  error,
  status,
  showFingerprint = false,
  allowPaste = false,
  pinLength = PIN_ENTRY_LENGTH,
  inputDisabled = false,
  onDigit,
  onBackspace,
  onFingerprint = () => {},
  onFill,
}: PinEntrySurfaceProps) {
  return (
    <View className="w-full items-center">
      <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
      <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">{title}</Text>
      <Text className="mt-2 text-center text-xs text-[#8a9bb0]">{subtitle}</Text>

      {allowPaste ? (
        <View className="mt-7 w-full px-2">
          <CodeBoxField
            value={pin}
            onChange={(code) => onFill?.(code)}
            length={pinLength}
            disabled={inputDisabled}
            testID="pin-entry-code-boxes"
          />
        </View>
      ) : (
        <View className="mt-7 flex-row gap-3">
          {Array.from({ length: pinLength }).map((_, index) => (
            <View
              key={index}
              className={`h-3 w-3 rounded-full ${index < pin.length ? 'bg-black' : 'border border-[#8a9bb0]'}`}
            />
          ))}
        </View>
      )}

      {error ? (
        <Text className="mt-4 text-center text-sm font-medium text-[#c00000]">{error}</Text>
      ) : null}
      {status ? (
        <Text className="mt-4 text-sm text-[#6d7a8d]">{status}</Text>
      ) : null}

      {!allowPaste ? (
        <PinKeypad
          onDigit={onDigit}
          onBackspace={onBackspace}
          onFingerprint={onFingerprint}
          showFingerprint={showFingerprint}
        />
      ) : null}
    </View>
  )
}
