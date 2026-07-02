import { PIN_ENTRY_LENGTH, PinEntrySurface } from '../PinEntrySurface'



type PinEntryStepProps = {

  title: string

  subtitle: string

  pin: string

  error?: string | null

  onDigit: (digit: string) => void

  onBackspace: () => void

  showFingerprint?: boolean

  onFingerprint?: () => void

  /** OTP / email code: tappable boxes with OS keyboard paste and autofill. */

  allowPaste?: boolean

  pinLength?: number

  /** Receives normalized digits as the user types or pastes. */

  onFill?: (code: string) => void

  inputDisabled?: boolean

}



export function PinEntryStep({

  title,

  subtitle,

  pin,

  error,

  onDigit,

  onBackspace,

  showFingerprint = false,

  onFingerprint = () => {},

  allowPaste = false,

  pinLength = PIN_ENTRY_LENGTH,

  onFill,

  inputDisabled = false,

}: PinEntryStepProps) {
  return (
    <PinEntrySurface
      title={title}
      subtitle={subtitle}
      pin={pin}
      error={error}
      showFingerprint={showFingerprint}
      allowPaste={allowPaste}
      pinLength={pinLength}
      inputDisabled={inputDisabled}
      onDigit={onDigit}
      onBackspace={onBackspace}
      onFingerprint={onFingerprint}
      onFill={onFill}
    />
  )
}

export const AUTH_PIN_LENGTH = PIN_ENTRY_LENGTH
