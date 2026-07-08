import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { normalizeNumericCode } from '../../utils/normalizeNumericCode'

type CodeBoxFieldProps = {
  value: string
  onChange: (code: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  testID?: string
}

export function CodeBoxField({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = true,
  testID = 'code-box-field',
}: CodeBoxFieldProps) {
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!autoFocus || disabled) return
    const timer = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(timer)
  }, [autoFocus, disabled])

  function handleChangeText(text: string) {
    onChange(normalizeNumericCode(text, length))
  }

  function focusInput() {
    if (!disabled) inputRef.current?.focus()
  }

  const activeIndex = value.length < length ? value.length : length - 1

  return (
    <Pressable
      testID={testID}
      onPress={focusInput}
      accessibilityRole="button"
      accessibilityLabel="Verification code field"
      className="relative w-full items-center">
      <View className="flex-row justify-center gap-2.5" pointerEvents="none">
        {Array.from({ length }).map((_, index) => {
          const digit = value[index] ?? ''
          const isActive = focused && index === activeIndex
          const isFilled = index < value.length

          return (
            <View
              key={index}
              className={`h-14 w-11 items-center justify-center rounded-xl border-2 bg-white ${
                isActive
                  ? 'border-ink'
                  : isFilled
                    ? 'border-blue-gray'
                    : 'border-slate120'
              }`}
              style={{ borderCurve: 'continuous' }}>
              <Text className="text-[22px] font-semibold text-ink">{digit}</Text>
            </View>
          )
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID={`${testID}-input`}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        importantForAutofill="yes"
        maxLength={length}
        caretHidden
        className="absolute inset-0 opacity-0"
        accessibilityLabel="Verification code input"
      />
    </Pressable>
  )
}
