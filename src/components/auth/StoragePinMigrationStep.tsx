/**
 * Migrate legacy storage unlock to Wallet PIN (biometric then PIN).
 * Journey: startup in app/_layout.tsx.
 * Copy: inline Thai titles, step labels, and errors.
 * Layout: WalletHeader, white card, PinEntrySurface, PinKeypad.
 * Map: docs/CODEMAPS/frontend.md#auth-and-pin
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '@/src/components/AppButton'
import { PIN_ENTRY_LENGTH, PinEntrySurface } from '@/src/components/PinEntrySurface'
import { PinKeypad } from '@/src/components/PinKeypad'
import { WalletHeader } from '@/src/components/WalletHeader'
import { setWalletPin, verifyWalletPin } from '@/src/services/auth/walletPin'
import { logWalletStep } from '@/src/services/debug/walletLogger'

import { THEME } from '../../config/themeColors'

export type StoragePinMigrationStepProps = {
  step: 'biometric' | 'pin'
  error?: string
  isSubmitting?: boolean
  onBeginBiometric: () => void
  onComplete: () => void
}

function SecurityUpdateIconTile({
  icon,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
}) {
  return (
    <View className="h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy-muted">
      <MaterialCommunityIcons name={icon} size={36} color={THEME.white} />
    </View>
  )
}

function StepBadge({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-blue-tint px-3 py-1">
      <Text className="text-[12px] font-semibold text-wallet-navy">{label}</Text>
    </View>
  )
}

function ReasonRow({
  icon,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-tint">
        <MaterialCommunityIcons name={icon} size={20} color={THEME.navy} />
      </View>
      <Text className="flex-1 text-[13px] font-semibold leading-5 text-navy-deep">{label}</Text>
    </View>
  )
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
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="อัปเดตความปลอดภัย" />
      <ScrollView
        className="flex-1 bg-wallet-bg"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow px-5 py-8"
      >
        {step === 'biometric' ? (
          <View className="items-center rounded-[24px] bg-white px-6 py-8">
            <StepBadge label="ขั้นที่ 1/2" />
            <View className="mt-5">
              <SecurityUpdateIconTile icon="shield-lock-outline" />
            </View>
            <Text className="mt-6 text-center text-[22px] font-extrabold text-navy-deep">
              ยืนยันตัวตน
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-6 text-gray500">
              หลังอัปเดตแอป ให้ยืนยันตัวตนครั้งแรกด้วยลายนิ้วมือหรือใบหน้า
            </Text>

            <View className="mt-6 w-full gap-3.5 border-t border-gray-light pt-5">
              <ReasonRow
                icon="fingerprint"
                label="ครั้งแรกสแกนลายนิ้วมือหรือใบหน้าเพื่อเปิดข้อมูลบนเครื่อง"
              />
              <ReasonRow
                icon="lock-outline"
                label="ครั้งถัดไปใช้ PIN เปิดแอปได้เลย รวมโหมด offline"
              />
            </View>

            {displayError ? (
              <Text className="mt-4 text-center text-sm font-medium text-danger">{displayError}</Text>
            ) : null}

            <AppButton
              testID="migration-biometric-button"
              variant="solid-block"
              label="สแกนลายนิ้วมือ / ใบหน้า"
              iconName="fingerprint"
              iconSize={20}
              onPress={onBeginBiometric}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
              className="mt-8 py-4"
            />
          </View>
        ) : (
          <View>
            <View className="items-center rounded-[24px] bg-white px-6 py-8">
              <StepBadge label="ขั้นที่ 2/2" />
              <View className="mt-5">
                <SecurityUpdateIconTile icon="lock-outline" />
              </View>
              <View className="mt-6 w-full">
                <PinEntrySurface
                  title="ยืนยันรหัส PIN"
                  subtitle="ใส่รหัส PIN 6 หลักเดิมของคุณเพื่อเปิดใช้การปลดล็อกด้วย PIN"
                  pin={pin}
                  error={displayError}
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                  onFingerprint={() => undefined}
                  showFingerprint={false}
                  showLock={false}
                  showKeypad={false}
                />
              </View>
            </View>
            <View className="mt-6 items-center">
              <PinKeypad
                onDigit={handleDigit}
                onBackspace={handleBackspace}
                onFingerprint={() => undefined}
                showFingerprint={false}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
