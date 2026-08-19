/**
 * Visual trust card (issuer image, labels, confirm).
 * Journey: P1 via IssuanceTrustConfirmationPanel.
 * Copy: props; accent via THEME.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import { Image, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { THEME } from '../config/themeColors'

type Props = {
  image: ImageSourcePropType
  imageTestID?: string
  imageClassName?: string
  issuerLabel: string
  documentLabel: string
  onConfirm: () => void
  confirmLabel?: string
  badge?: React.ReactNode
  accent?: 'navy' | 'pink'
}

export function TrustConfirmationCard({
  image,
  imageTestID,
  imageClassName = 'h-24 w-24',
  issuerLabel,
  documentLabel,
  onConfirm,
  confirmLabel = 'ยืนยัน',
  badge,
  accent = 'navy',
}: Props) {
  const borderColor = accent === 'pink' ? THEME.pink : THEME.navy

  return (
    <View testID="trust-confirmation-content" className="flex-1 items-center justify-center bg-surface px-10">
      <View
        testID="trust-confirmation-card"
        className="relative min-h-[200px] w-full max-w-[340px] rounded-lg bg-white px-5 pb-6 pt-5"
        style={{ borderWidth: 8, borderColor }}>
        {badge}

        <View className="items-center">
          <Image
            testID={imageTestID}
            source={image}
            className={imageClassName}
            resizeMode="contain"
            accessibilityLabel={issuerLabel}
          />
          <Text className="mt-2 text-center text-[13px] font-extrabold text-black">{issuerLabel}</Text>
        </View>

        <View className="mt-7 items-center gap-2">
          <Text className="text-center text-[11px] font-semibold text-black">เอกสาร  :  {documentLabel}</Text>
          <Text className="text-center text-[11px] font-semibold text-black">หน่วยงานที่รับรอง : {issuerLabel}</Text>
        </View>

        <AppButton variant="solid-block" label={confirmLabel} onPress={onConfirm} className="mt-8 h-9 min-w-[98px] self-center !bg-success px-6" textClassName="text-[13px]" />
      </View>
    </View>
  )
}
