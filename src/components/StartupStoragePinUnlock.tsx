import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { STARTUP_PIN_UNLOCK_DISABLED_MESSAGE } from '@/src/services/startup/startupState'

import { PinKeypad } from './PinKeypad'

const PIN_LENGTH = 6

type StartupStoragePinUnlockProps = {
  pinUnlockEnabled: boolean
  isSubmitting: boolean
  error?: string
  onSubmit: (pin: string) => void
  onRetryBiometric: () => void
  onForgotPin: () => void
}

export function StartupStoragePinUnlock({
  pinUnlockEnabled,
  isSubmitting,
  error,
  onSubmit,
  onRetryBiometric,
  onForgotPin,
}: StartupStoragePinUnlockProps) {
  const [pin, setPin] = useState('')

  function handleDigit(digit: string) {
    if (!pinUnlockEnabled || pin.length >= PIN_LENGTH) return

    const next = pin + digit
    setPin(next)
    if (next.length === PIN_LENGTH) {
      setPin('')
      onSubmit(next)
    }
  }

  function handleBackspace() {
    if (!pinUnlockEnabled) return
    setPin((current) => current.slice(0, -1))
  }

  function handleRetryBiometric() {
    if (isSubmitting) return
    onRetryBiometric()
  }

  function handleForgotPin() {
    if (isSubmitting) return
    onForgotPin()
  }

  const helperMessage = !pinUnlockEnabled ? STARTUP_PIN_UNLOCK_DISABLED_MESSAGE : undefined

  return (
    <View className="absolute inset-0 flex-1 items-center justify-center bg-[#eef1f4] px-5">
      <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
      <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">Enter PIN</Text>
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
      ) : helperMessage ? (
        <Text className="mt-4 text-center text-sm text-[#6d7a8d]">{helperMessage}</Text>
      ) : null}
      <PinKeypad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        onFingerprint={handleRetryBiometric}
        showFingerprint
        digitsDisabled={!pinUnlockEnabled}
      />
      <Pressable className="mt-8" onPress={handleForgotPin}>
        <Text className="text-sm font-medium text-wallet-navy">ลืมรหัส PIN?</Text>
      </Pressable>
    </View>
  )
}
