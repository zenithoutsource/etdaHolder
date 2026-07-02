import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PIN_ENTRY_LENGTH, PinEntrySurface } from '@/src/components/PinEntrySurface'
import { setWalletPin, verifyWalletPin } from '@/src/services/auth/walletPin'
import { logWalletStep } from '@/src/services/debug/walletLogger'

export type StoragePinMigrationStepProps = {
  step: 'biometric' | 'pin'
  error?: string
  isSubmitting?: boolean
  onBeginBiometric: () => void
  onComplete: () => void
}

export function StoragePinMigrationStep({
  step,
  error,
  isSubmitting = false,
  onBeginBiometric,
  onComplete,
}: StoragePinMigrationStepProps) {
  const [pin, setPin] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleDigit(digit: string) {
    if (pin.length >= PIN_ENTRY_LENGTH) return

    const next = pin + digit
    setPin(next)
    setLocalError(null)

    if (next.length !== PIN_ENTRY_LENGTH) return

    if (!verifyWalletPin(next)) {
      setPin('')
      setLocalError('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
      return
    }

    try {
      setWalletPin(next)
      logWalletStep('startup', 'storage-pin-migration-complete')
      setPin('')
      onComplete()
    } catch {
      setPin('')
      setLocalError('ไม่สามารถอัปเดตการปลดล็อกด้วย PIN ได้ กรุณาลองใหม่อีกครั้ง')
    }
  }

  function handleBackspace() {
    setPin((current) => current.slice(0, -1))
    setLocalError(null)
  }

  const displayError = localError ?? error

  return (
    <SafeAreaView className="flex-1 bg-[#eef1f4]" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-5">
        {step === 'biometric' ? (
          <View className="w-full items-center">
            <Text className="text-sm font-medium text-[#002887]">ขั้นที่ 1/2</Text>
            <View className="mt-3">
              <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
            </View>
            <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">อัปเดตความปลอดภัย</Text>
            <Text className="mt-2 text-center text-xs text-[#8a9bb0]">
              หลังอัปเดตแอป ครั้งแรกให้สแกนลายนิ้วมือหรือใบหน้าเพื่อเปิดข้อมูลบนเครื่อง
              {'\n'}
              ครั้งถัดไปใช้ PIN เปิดแอปได้เลย (รวมโหมด offline)
            </Text>
            {displayError ? (
              <Text className="mt-4 text-center text-sm font-medium text-[#c00000]">{displayError}</Text>
            ) : null}
            <Pressable
              testID="migration-biometric-button"
              className={`mt-8 w-full rounded-xl bg-[#002887] px-4 py-4 ${isSubmitting ? 'opacity-60' : ''}`}
              disabled={isSubmitting}
              onPress={onBeginBiometric}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-center text-base font-semibold text-white">สแกนลายนิ้วมือ / ใบหน้า</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View className="w-full items-center">
            <Text className="text-sm font-medium text-[#002887]">ขั้นที่ 2/2</Text>
            <PinEntrySurface
              title="ยืนยันรหัส PIN"
              subtitle="ใส่รหัส PIN 6 หลักเดิมของคุณเพื่อเปิดใช้การปลดล็อกด้วย PIN"
              pin={pin}
              error={displayError}
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              onFingerprint={() => undefined}
              showFingerprint={false}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
