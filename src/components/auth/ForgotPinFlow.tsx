import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '@/src/components/AppButton'
import { AUTH_PIN_LENGTH, PinEntryStep } from '@/src/components/auth/PinEntryStep'
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
  const autoSendAttemptedRef = useRef(false)

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

  return (
    <SafeAreaView className="flex-1 bg-surface-soft">
      <KeyboardAvoidingView
        className="flex-1 justify-center p-6"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="mb-8">
          <Text className="text-center text-[28px] font-bold text-wallet-navy">Reset PIN</Text>
          <Text className="mt-2 text-center text-[15px] text-slate">
            {step === 'email'
              ? 'We will email you a verification code'
              : step === 'otp'
                ? 'Enter the 6-digit code sent to your email'
                : 'Choose a new 6-digit PIN'}
          </Text>
          {showResetNotice && step === 'email' ? (
            <Text className="mt-3 text-center text-[13px] text-slate">
              หลังรีเซ็ต PIN คุณต้องเข้าสู่ระบบใหม่ ข้อมูลในเครื่องจะถูกล้างและซิงค์จากเซิร์ฟเวอร์อีกครั้ง
            </Text>
          ) : null}
        </View>

        {step === 'email' && isLoading ? (
          <View className="items-center gap-3">
            <Text className="text-sm text-slate">Sending verification code…</Text>
          </View>
        ) : null}

        {step === 'email' && !isLoading ? (
          <View
            className="gap-4 rounded-[18px] bg-white p-6"
            style={{
              elevation: 3,
              shadowColor: THEME.navyShadow,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
            }}>
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
              className={`rounded-xl py-[14px] ${isLoading ? 'opacity-70' : ''}`}
              textClassName="text-[15px] font-semibold"
            />
          </View>
        ) : null}

        {step === 'otp' ? (
          <View className="items-center">
            <Text className="mb-4 text-sm text-slate">{email}</Text>
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
            />
            {isLoading && otp.length === AUTH_PIN_LENGTH ? (
              <Text className="mt-4 text-sm text-slate">Verifying code…</Text>
            ) : null}
            <Pressable className="mt-4" onPress={() => void handleEmailContinue()} disabled={isLoading}>
              <Text className="text-sm font-medium text-wallet-navy">
                {isLoading ? (otp.length === AUTH_PIN_LENGTH ? 'Verifying…' : 'Sending…') : 'Resend code'}
              </Text>
            </Pressable>
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
            {isLoading ? <Text className="mt-4 text-sm text-slate">Please wait...</Text> : null}
          </View>
        ) : null}

        <Pressable className="mt-6 items-center" onPress={onBack}>
          <Text className="text-sm text-slate">Back</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
