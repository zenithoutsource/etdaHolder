import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { PIN_ENTRY_LENGTH, PinEntrySurface } from './PinEntrySurface'

const PIN_COMPLETE_VISUAL_DELAY_MS = 180
const DEFAULT_TITLE = 'Enter PIN'
const DEFAULT_SUBTITLE = 'โปรดระบุรหัส PIN 6 หลัก หรือใช้สแกนใบหน้า / ลายนิ้วมือ'
const DEFAULT_FORGOT_PIN_LABEL = 'ลืมรหัส PIN?'

type PinUnlockPromptProps = {
  title?: string
  subtitle?: string
  forgotPinLabel?: string
  error?: string | null
  status?: string | null
  actionsDisabled?: boolean
  showFingerprint?: boolean
  className?: string
  onSubmit: (pin: string) => void
  onBackspace?: () => void
  onBiometricPress: () => void
  onForgotPin: () => void
  onInteraction?: () => void
}

export function PinUnlockPrompt({
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  forgotPinLabel = DEFAULT_FORGOT_PIN_LABEL,
  error,
  status,
  actionsDisabled = false,
  showFingerprint = true,
  className = 'flex-1 items-center justify-center px-5',
  onSubmit,
  onBackspace,
  onBiometricPress,
  onForgotPin,
  onInteraction,
}: PinUnlockPromptProps) {
  const [pin, setPin] = useState('')

  function handleDigit(digit: string) {
    if (pin.length >= PIN_ENTRY_LENGTH) return

    onInteraction?.()
    const next = pin + digit
    setPin(next)

    if (next.length === PIN_ENTRY_LENGTH) {
      // Delay submit so React has time to paint the filled last dot before
      // the parent reacts to onSubmit and navigates away (which can unmount
      // this component before an immediate/same-tick update ever renders).
      setTimeout(() => {
        setPin('')
        onSubmit(next)
      }, PIN_COMPLETE_VISUAL_DELAY_MS)
    }
  }

  function handleBackspace() {
    onInteraction?.()
    onBackspace?.()
    setPin((current) => current.slice(0, -1))
  }

  function handleBiometricPress() {
    if (actionsDisabled) return
    onBiometricPress()
  }

  function handleForgotPin() {
    if (actionsDisabled) return
    onForgotPin()
  }

  return (
    <View className={className}>
      <PinEntrySurface
        title={title}
        subtitle={subtitle}
        pin={pin}
        error={error}
        status={status}
        showFingerprint={showFingerprint}
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        onFingerprint={handleBiometricPress}
      />
      <Pressable className="mt-8" onPress={handleForgotPin}>
        <Text className="text-sm font-medium text-wallet-navy">{forgotPinLabel}</Text>
      </Pressable>
    </View>
  )
}
