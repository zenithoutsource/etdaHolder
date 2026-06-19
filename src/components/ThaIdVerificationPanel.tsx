import { Image, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { getCardSchemaForConfigurationId, type IssuanceVerificationConfig } from '../config/cardSchemas'
import type { ResolvedCredentialOffer } from '../services/vci/exchangeService'

const verificationImages: Record<IssuanceVerificationConfig['imageKey'], ImageSourcePropType> = {
  thaid: require('../../assets/images/thaid.png'),
}

const DEFAULT_VERIFICATION: IssuanceVerificationConfig = {
  providerLabel: 'ThaID',
  imageKey: 'thaid',
}

type Props = {
  offer: ResolvedCredentialOffer
  onContinue: () => void
}

export function ThaIdVerificationPanel({ offer, onContinue }: Props) {
  const schema = getCardSchemaForConfigurationId(offer.credentialConfigurations[0]?.id)
  const verification = schema.issuanceVerification ?? DEFAULT_VERIFICATION
  const verificationImage = verificationImages[verification.imageKey]

  return (
    <View className="flex-1 items-center bg-[#eef1f4] px-6 pt-16">
      <View className="w-full max-w-[330px] items-center rounded-[16px] bg-white px-6 py-8 mt-20 border-8 border-blue-800">
        <Text className="mb-2 text-center text-[20px] font-extrabold leading-7 text-black">
          ยืนยันตัวตนผ่าน
        </Text>
        <Text className="mb-6 text-center text-[20px] font-extrabold leading-7 text-black">
          {verification.providerLabel}
        </Text>
        <Image
          testID="thaid-verification-image"
          source={verificationImage}
          className="h-[128px] w-[128px] rounded-3xl"
          resizeMode="contain"
          accessibilityLabel={verification.providerLabel}
        />
        <AppButton variant="solid-block" label="ยืนยัน" onPress={onContinue} className="mt-8 h-11 min-w-[132px] !bg-[#18a05d] px-6" />
      </View>
    </View>
  )
}
