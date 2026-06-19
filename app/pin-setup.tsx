import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PinKeypad } from '../src/components/PinKeypad'
import { setWalletPin } from '../src/services/auth/walletPin'
import { useAuthStore } from '../src/store/authStore'

const PIN_LENGTH = 6

export default function PinSetupScreen() {
  const router = useRouter()
  const setPinVerified = useAuthStore((s) => s.setPinVerified)
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError(null)
    if (next.length === PIN_LENGTH) {
      if (phase === 'enter') {
        setFirstPin(next)
        setPin('')
        setPhase('confirm')
      } else {
        if (next === firstPin) {
          if (Platform.OS !== 'web') {
            setWalletPin(next)
          }
          setPinVerified(true)
          router.replace('/(tabs)')
        } else {
          setPin('')
          setFirstPin('')
          setPhase('enter')
          setError('PIN does not match. Try again.')
        }
      }
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1))
    setError(null)
  }

  const title = phase === 'enter' ? 'Set PIN' : 'Confirm PIN'
  const subtitle =
    phase === 'enter'
      ? 'กรุณาสร้างรหัส PIN 6 หลักสำหรับ Wallet ก่อนอนุมัติการดำเนิน'
      : 'กรุณากรอกรหัส PIN 6 หลักเดิมอีกครั้งเพื่อยืนยัน'

  return (
    <SafeAreaView className="flex-1 bg-[#eef1f4]" edges={['top', 'bottom']}>
      <View className="flex-1 items-center px-5 pt-8 mt-28">
        <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
        <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">{title}</Text>
        <Text className="mt-2 text-center text-xs text-[#8a9bb0]">{subtitle}</Text>
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
        <PinKeypad onDigit={handleDigit} onBackspace={handleBackspace} onFingerprint={() => {}} showFingerprint={false} />
      </View>
    </SafeAreaView>
  )
}
