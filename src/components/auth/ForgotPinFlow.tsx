/**
 * Forgot-PIN flow — email, OTP, new PIN confirm.
 * Journey: Auth (forgot-pin route and startup overlay).
 * Copy: authValidation; authStore reset APIs; inline step titles.
 * Layout: WalletHeader, keyboard-avoiding ScrollView, PinEntryStep.
 * Next: logout then /auth (credentials stay on device).
 * Map: docs/CODEMAPS/frontend.md#auth-and-pin
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '@/src/components/AppButton'
import { AUTH_PIN_LENGTH, PinEntryStep } from '@/src/components/auth/PinEntryStep'
import { PinKeypad } from '@/src/components/PinKeypad'
import { WalletHeader } from '@/src/components/WalletHeader'
import { isValidEmailFormat, pinValidationMessage } from '@/src/services/auth/authValidation'
import { useAuthStore } from '@/src/store/authStore'

import { THEME } from '../../config/themeColors'

type ForgotPinStep = 'email' | 'otp' | 'pin-enter' | 'pin-confirm'

type ForgotPinFlowProps = {
  onComplete: () => void | Promise<void>
  onBack: () => void
  prefilledEmail?: string
  showResetNotice?: boolean
}

function ResetPinIconTile() {
  return (
    <View className="h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy-muted">
      <MaterialCommunityIcons name="lock-outline" size={36} color={THEME.white} />
    </View>
  )
}

export function ForgotPinFlow({
  onComplete,
  onBack,
  prefilledEmail = '',
  showResetNotice = false,
}: ForgotPinFlowProps) {
  const requestPinReset = useAuthStore((s) => s.requestPinReset)
  const verifyPinResetOtp = useAuthStore((s) => s.verifyPinResetOtp)
  const confirmPinReset = useAuthStore((s) => s.confirmPinReset)
  const isLoading = useAuthStore((s) => s.isLoading)

  const [step, setStep] = useState<ForgotPinStep>('email')
  const [email, setEmail] = useState(prefilledEmail.trim().toLowerCase())
  const [otp, setOtp] = useState('')
  const [pin, setPin] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const autoSendAttemptedRef = useRef(false)
  const scrollRef = useRef<ScrollView>(null)

  function resetPinState() {
    setPin('')
    setFirstPin('')
    setError(null)
  }

  async function handleEmailContinue(nextEmail?: string) {
    const normalizedEmail = (nextEmail ?? email).trim().toLowerCase()
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

  useEffect(() => {
    if (autoSendAttemptedRef.current || step !== 'email') return
    const prefilled = prefilledEmail.trim().toLowerCase()
    if (!isValidEmailFormat(prefilled)) return
    autoSendAttemptedRef.current = true
    void handleEmailContinue(prefilled)
  }, [prefilledEmail, step])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height)
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true })
      })
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  async function verifyOtpAndContinue(code: string) {
    setError(null)
    try {
      await verifyPinResetOtp(email, code)
      resetPinState()
      setStep('pin-enter')
    } catch (err) {
      setOtp('')
      setError(err instanceof Error ? err.message : 'Invalid or expired code')
    }
  }

  function handleOtpDigit(digit: string) {
    if (isLoading || otp.length >= AUTH_PIN_LENGTH) return
    const next = otp + digit
    setOtp(next)
    setError(null)
    if (next.length === AUTH_PIN_LENGTH) {
      void verifyOtpAndContinue(next)
    }
  }

  function handleOtpBackspace() {
    setOtp((current) => current.slice(0, -1))
    setError(null)
  }

  function handleOtpFill(code: string) {
    if (isLoading) return
    setOtp(code)
    setError(null)
    if (code.length === AUTH_PIN_LENGTH) {
      void verifyOtpAndContinue(code)
    }
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

  function isOtpRelatedError(message: string): boolean {
    const normalized = message.toLowerCase()
    return normalized.includes('otp') || normalized.includes('expired') || normalized.includes('too many')
  }

  async function completeReset(confirmedPin: string) {
    try {
      await confirmPinReset(email, otp, confirmedPin)
      await onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PIN reset failed'
      resetPinState()
      if (isOtpRelatedError(message)) {
        setOtp('')
        setStep('otp')
      } else {
        setStep('pin-enter')
      }
      setError(message)
    }
  }

  const stepSubtitle =
    step === 'email'
      ? 'We will email you a verification code'
      : step === 'otp'
        ? 'Enter the 6-digit code sent to your email'
        : 'Choose a new 6-digit PIN'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="Reset PIN" onBack={onBack} />
      <KeyboardAvoidingView
        className="flex-1 bg-wallet-bg"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pt-8"
          contentContainerStyle={{ paddingBottom: Math.max(keyboardHeight, 32) }}
        >
          {step === 'email' ? (
            <View className="items-center rounded-[24px] bg-white px-6 py-8">
              <ResetPinIconTile />
              <Text className="mt-6 text-center text-[22px] font-extrabold text-navy-deep">Email</Text>
              <Text className="mt-2 text-center text-[13px] leading-6 text-gray500">{stepSubtitle}</Text>
              {showResetNotice ? (
                <Text className="mt-3 text-center text-[13px] leading-5 text-slate">
                  หลังรีเซ็ต PIN ให้เข้าสู่ระบบอีกครั้งด้วย PIN ใหม่
                </Text>
              ) : null}
              {isLoading ? (
                <Text className="mt-6 text-sm text-slate">Sending verification code…</Text>
              ) : (
                <View className="mt-6 w-full gap-4">
                  <TextInput
                    className="rounded-[10px] border border-surface-edge p-[14px] text-[15px] text-ink"
                    placeholder="Email"
                    placeholderTextColor={THEME.gray400}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                    onSubmitEditing={() => void handleEmailContinue()}
                  />
                  {error ? <Text className="text-center text-[13px] text-red600">{error}</Text> : null}
                  <AppButton
                    variant="solid-block"
                    label="Send Code"
                    onPress={() => void handleEmailContinue()}
                    disabled={isLoading}
                    loading={isLoading}
                    fullWidth
                    className="py-[14px]"
                    textClassName="text-[15px] font-semibold"
                  />
                </View>
              )}
            </View>
          ) : null}

          {step === 'otp' ? (
            <View className="items-center rounded-[24px] bg-white px-6 py-8">
              <ResetPinIconTile />
              <Text className="mt-6 text-center text-[13px] text-slate">{email}</Text>
              <View className="mt-4 w-full">
                <PinEntryStep
                  title="Enter Code"
                  subtitle="Tap the boxes to enter or paste the code from your email"
                  pin={otp}
                  error={error}
                  onDigit={handleOtpDigit}
                  onBackspace={handleOtpBackspace}
                  allowPaste
                  onFill={handleOtpFill}
                  inputDisabled={isLoading}
                  showFingerprint={false}
                  showLock={false}
                />
              </View>
              {isLoading && otp.length === AUTH_PIN_LENGTH ? (
                <Text className="mt-4 text-sm text-slate">Verifying code…</Text>
              ) : null}
              <AppButton
                variant="outline-block"
                label={isLoading ? (otp.length === AUTH_PIN_LENGTH ? 'Verifying…' : 'Sending…') : 'Resend code'}
                onPress={() => void handleEmailContinue()}
                disabled={isLoading}
                fullWidth
                className="mt-6 py-[14px]"
              />
            </View>
          ) : null}

          {step === 'pin-enter' || step === 'pin-confirm' ? (
            <View>
              <View className="items-center rounded-[24px] bg-white px-6 py-8">
                <ResetPinIconTile />
                <View className="mt-6 w-full">
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
                    showLock={false}
                    showKeypad={false}
                  />
                </View>
                {isLoading ? <Text className="mt-4 text-sm text-slate">Please wait...</Text> : null}
              </View>
              <View className="mt-6 items-center">
                <PinKeypad
                  onDigit={handlePinDigit}
                  onBackspace={handlePinBackspace}
                  onFingerprint={() => undefined}
                  showFingerprint={false}
                />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
