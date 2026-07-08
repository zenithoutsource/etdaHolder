import { Image, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'

type Props = {
  image: ImageSourcePropType
  imageTestID?: string
  imageClassName?: string
  issuerLabel: string
  documentLabel: string
  onConfirm: () => void
  confirmLabel?: string
  badge?: React.ReactNode
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
}: Props) {
  return (
    <View className="flex-1 bg-surface px-10 pt-[60px]">
      <View className="relative min-h-[200px] rounded-lg border-[8px] border-wallet-navy bg-white px-5 pb-6 pt-5">
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
