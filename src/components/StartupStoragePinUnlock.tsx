import { PinUnlockPrompt } from './PinUnlockPrompt'
import { readStartupStorageUnlockCopy } from '@/src/services/startup/startupState'

type StartupStoragePinUnlockProps = {
  isSubmitting: boolean
  fallbackAvailable: boolean
  pinUnlockEnabled: boolean
  error?: string
  onSubmit: (pin: string) => void
  onRetryBiometric: () => void
  onForgotPin: () => void
}

export function StartupStoragePinUnlock({
  isSubmitting,
  fallbackAvailable,
  pinUnlockEnabled,
  error,
  onSubmit,
  onRetryBiometric,
  onForgotPin,
}: StartupStoragePinUnlockProps) {
  const copy = readStartupStorageUnlockCopy(fallbackAvailable, pinUnlockEnabled)

  return (
    <PinUnlockPrompt
      className="absolute inset-0 flex-1 items-center justify-center bg-[#eef1f4] px-5"
      title={copy.title}
      subtitle={copy.subtitle}
      error={error}
      actionsDisabled={isSubmitting}
      onSubmit={onSubmit}
      onBiometricPress={onRetryBiometric}
      onForgotPin={onForgotPin}
    />
  )
}
