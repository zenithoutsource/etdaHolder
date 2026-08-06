import { AppButton } from '@/src/components/AppButton'
import { isProximityPresentationSupported } from '@/src/services/proximity/proximityPresentation'

type ProximityPresentButtonProps = {
  onPress: () => void
  disabled?: boolean
}

export function ProximityPresentButton({ onPress, disabled = false }: ProximityPresentButtonProps) {
  if (!isProximityPresentationSupported()) return null

  return (
    <AppButton
      variant="solid-block"
      label="NFC"
      iconName="nfc-variant"
      onPress={onPress}
      disabled={disabled}
      className="mt-4 border-0 bg-wallet-navy py-3"
      textClassName="text-center text-sm font-bold"
    />
  )
}
