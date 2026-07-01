import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'

import { Text, View } from 'react-native'



import { PinKeypad } from '../PinKeypad'

import { CodeBoxField } from './CodeBoxField'



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

  /** OTP / email code: tappable boxes with OS keyboard paste and autofill. */

  allowPaste?: boolean

  pinLength?: number

  /** Receives normalized digits as the user types or pastes. */

  onFill?: (code: string) => void

  inputDisabled?: boolean

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

  allowPaste = false,

  pinLength = PIN_LENGTH,

  onFill,

  inputDisabled = false,

}: PinEntryStepProps) {

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



export const AUTH_PIN_LENGTH = PIN_LENGTH

