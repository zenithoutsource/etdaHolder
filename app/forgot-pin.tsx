import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../src/components/AppButton'
import { AUTH_PIN_LENGTH, PinEntryStep } from '../src/components/auth/PinEntryStep'
import { isValidEmailFormat, pinValidationMessage } from '../src/services/auth/authValidation'
import { useAuthStore } from '../src/store/authStore'

type ForgotPinStep = 'email' | 'otp' | 'pin-enter' | 'pin-confirm'

export default function ForgotPinScreen() {
  const router = useRouter()
  const requestPinReset = useAuthStore((s) => s.requestPinReset)
  const confirmPinReset = useAuthStore((s) => s.confirmPinReset)
  const logout = useAuthStore((s) => s.logout)
  const isLoading = useAuthStore((s) => s.isLoading)

  const [step, setStep] = useState<ForgotPinStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [pin, setPin] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetPinState() {
    setPin('')
    setFirstPin('')
    setError(null)
  }

  async function handleEmailContinue() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!isValidEmailFormat(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }

    setError(null)
    try {
      await requestPinReset(normalizedEmail)
      setEmail(normalizedEmail)
      setStep('otp')
      setOtp('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code')
    }
  }

  function handleOtpDigit(digit: string) {
    if (otp.length >= AUTH_PIN_LENGTH) return
    const next = otp + digit
    setOtp(next)
    setError(null)
    if (next.length === AUTH_PIN_LENGTH) {
      resetPinState()
      setStep('pin-enter')
    }
  }

  function handleOtpBackspace() {
    setOtp((current) => current.slice(0, -1))
    setError(null)
  }

  function handlePinDigit(digit: string) {
    if (pin.length >= AUTH_PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError(null)

    if (next.length !== AUTH_PIN_LENGTH) return

    if (step === 'pin-enter') {
      const pinError = pinValidationMessage(next)
      if (pinError) {
        setPin('')
        setError(pinError)
        return
      }
      setFirstPin(next)
      setPin('')
      setStep('pin-confirm')
      return
    }

    if (next !== firstPin) {
      setPin('')
      setFirstPin('')
      setStep('pin-enter')
      setError('PIN does not match. Try again.')
      return
    }

    void completeReset(next)
  }

  function handlePinBackspace() {
    setPin((current) => current.slice(0, -1))
    setError(null)
  }

  async function completeReset(confirmedPin: string) {
    try {
      await confirmPinReset(email, otp, confirmedPin)
      await logout()
      router.replace('/auth')
    } catch (err) {
      resetPinState()
      setStep('pin-enter')
      setError(err instanceof Error ? err.message : 'PIN reset failed')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f4f6fa]">
      <KeyboardAvoidingView
        className="flex-1 justify-center p-6"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="mb-8">
          <Text className="text-center text-[28px] font-bold text-wallet-navy">Reset PIN</Text>
          <Text className="mt-2 text-center text-[15px] text-[#6d7a8d]">
            {step === 'email'
              ? 'We will email you a verification code'
              : step === 'otp'
                ? 'Enter the 6-digit code from your email'
                : 'Choose a new 6-digit PIN'}
          </Text>
        </View>

        {step === 'email' ? (
          <View
            className="gap-4 rounded-[18px] bg-white p-6"
            style={{ elevation: 3, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 10 }}>
            <TextInput
              className="rounded-[10px] border border-[#e2e8f0] p-[14px] text-[15px] text-[#1a2a42]"
              placeholder="Email"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => void handleEmailContinue()}
            />
            {error ? <Text className="text-center text-[13px] text-[#dc2626]">{error}</Text> : null}
            <AppButton
              variant="solid-block"
              label="Send Code"
              onPress={() => void handleEmailContinue()}
              disabled={isLoading}
              loading={isLoading}
              className={`rounded-xl py-[14px] ${isLoading ? 'opacity-70' : ''}`}
              textClassName="text-[15px] font-semibold"
            />
          </View>
        ) : null}

        {step === 'otp' ? (
          <View className="items-center">
            <Text className="mb-4 text-sm text-[#6d7a8d]">{email}</Text>
            <PinEntryStep
              title="Enter Code"
              subtitle="Check your email for the 6-digit code"
              pin={otp}
              error={error}
              onDigit={handleOtpDigit}
              onBackspace={handleOtpBackspace}
              showFingerprint={false}
            />
          </View>
        ) : null}

        {step === 'pin-enter' || step === 'pin-confirm' ? (
          <View className="items-center">
            <PinEntryStep
              title={step === 'pin-enter' ? 'New PIN' : 'Confirm PIN'}
              subtitle={
                step === 'pin-enter'
                  ? 'Create a new 6-digit PIN'
                  : 'Enter the same PIN again to confirm'
              }
              pin={pin}
              error={error}
              onDigit={handlePinDigit}
              onBackspace={handlePinBackspace}
              showFingerprint={false}
            />
            {isLoading ? <Text className="mt-4 text-sm text-[#6d7a8d]">Please wait...</Text> : null}
          </View>
        ) : null}

        <Pressable className="mt-6 items-center" onPress={() => router.back()}>
          <Text className="text-sm text-[#6d7a8d]">Back</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
