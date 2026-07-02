import { Image, Text, View, type ImageSourcePropType } from 'react-native'

import {
  readCredentialHolderProfile,
  readCredentialSummaryDisplay,
} from '@/src/services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

const credentialImages: Record<string, ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/transcript.png'),
}

export function WalletCredentialSummaryCard({
  record,
}: {
  record: VerifiableCredentialRecord
}) {
  const display = readCredentialSummaryDisplay(record)
  const profile = readCredentialHolderProfile(record)
  const idNumber = display.rows.find((row) => row.key === 'nationalId')?.value
  const holderName = profile.thaiName ?? profile.englishName ?? display.primaryText

  return (
    <View
      className="h-[202px] justify-center overflow-hidden rounded-[18px] bg-[#003064] px-6"
      style={{
        elevation: 5,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.13,
        shadowRadius: 10,
      }}
    >
      <View className="flex-row items-center gap-6">
        <Image
          source={credentialImages[display.imageKey]}
          style={{ width: 110, height: 140, borderRadius: 30 }}
          resizeMode="cover"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] leading-6 text-white" numberOfLines={2}>
            {holderName}
          </Text>
          <Text className="mt-2 text-[12px] leading-5 text-white" numberOfLines={2}>
            ID Card : {idNumber}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function WalletEmptyCredentialCard({ message }: { message: string }) {
  return (
    <View
      className="h-[181px] justify-center rounded-[18px] bg-white px-5"
      style={{
        elevation: 5,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      }}
    >
      <Text className="text-center text-base font-semibold leading-6 text-gray-400">
        {message}
      </Text>
    </View>
  )
}
