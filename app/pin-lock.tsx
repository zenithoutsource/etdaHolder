import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAppDialog } from '../src/components/AppDialog'
import { PinKeypad } from '../src/components/PinKeypad'
import { isBiometricDisabledForTesting } from '../src/config/runtimeFlags'
import { verifyWalletPin } from '../src/services/auth/walletPin'
import { useAuthStore } from '../src/store/authStore'

const PIN_LENGTH = 6

export default function PinLockScreen() {
  const router = useRouter()
  const logout = useAuthStore((s) => s.logout)
  const { showDialog } = useAppDialog()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError(null)
    if (next.length === PIN_LENGTH) {
      if (Platform.OS !== 'web' && verifyWalletPin(next)) {
        router.replace('/(tabs)')
      } else {
        setPin('')
        setError('Incorrect PIN. Try again.')
      }
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1))
    setError(null)
  }

  function handleForgotPin() {
    showDialog({
      title: 'Forgot PIN?',
      message: 'You will be logged out and need to sign in again.',
      icon: 'warning',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Log Out',
          variant: 'danger',
          onPress: async () => {
            await logout()
            router.replace('/login')
          },
        },
      ],
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-[#eef1f4]" edges={['top', 'bottom']}>
      <View className="flex-1 items-center px-5 pt-8">
        <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
        <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">Enter PIN</Text>
        <Text className="mt-2 text-center text-xs text-[#8a9bb0]">
          โปรดระบุรหัส PIN 6 หลักเพื่อเข้าถึงข้อมูลของคุณ
        </Text>
        <View className="mt-7 flex-row gap-3">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-black' : 'border border-[#8a9bb0]'}`}
            />
          ))}
        </View>
        {error ? (
          <Text className="mt-4 text-center text-sm font-medium text-[#c00000]">{error}</Text>
        ) : null}
        <PinKeypad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onFingerprint={isBiometricDisabledForTesting() ? () => router.replace('/(tabs)') : () => {}}
        />
        <Pressable onPress={handleForgotPin} className="mt-8">
          <Text className="text-xs text-[#8a9bb0]">Forgot PIN?</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
