import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PIN_ENTRY_LENGTH, PinEntrySurface } from '../src/components/PinEntrySurface'
import { setWalletPin } from '../src/services/auth/walletPin'
import { useAuthStore } from '../src/store/authStore'
import { readPendingCredentialOfferRoute, useDeeplinkStore } from '../src/store/deeplinkStore'

export default function PinSetupScreen() {
  const router = useRouter()
  const setPinVerified = useAuthStore((s) => s.setPinVerified)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleDigit(digit: string) {
    if (pin.length >= PIN_ENTRY_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError(null)
    if (next.length === PIN_ENTRY_LENGTH) {
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
          const pendingRoute = readPendingCredentialOfferRoute({
            pendingUri: pendingDeeplinkUri,
            dismissedUri: dismissedDeeplinkUri,
            isAuthenticated,
            platform: Platform.OS,
            hasWalletPin: true,
          })
          if (pendingRoute) {
            router.push(pendingRoute)
            return
          }
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
        <PinEntrySurface
          title={title}
          subtitle={subtitle}
          pin={pin}
          error={error}
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onFingerprint={() => {}}
          showFingerprint={false}
        />
      </View>
    </SafeAreaView>
  )
}
