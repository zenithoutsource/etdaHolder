import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

const dopaImage = require('../../assets/images/dopa.png') as ImageSourcePropType

type Props = {
  record: VerifiableCredentialRecord
  onConfirm: () => void
}

export function ThaiIdSuccessConfirmationPanel({ onConfirm }: Props) {
  return (
    <View className="flex-1 bg-[#eef1f4] px-4 pt-[60px]">
      <View className="relative min-h-[222px] rounded-[10px] border-[3px] border-wallet-navy bg-white px-5 pb-6 pt-5">
        <View className="absolute -right-3 -top-6 items-center">
          <View className="h-[76px] w-[76px] items-center justify-center rounded-full bg-[#63db54]">
            <MaterialCommunityIcons name="check" size={42} color="#ffffff" />
          </View>
          <View className="-mt-2 flex-row gap-1">
            <View className="h-9 w-4 -rotate-12 bg-[#63db54]" />
            <View className="h-9 w-4 rotate-12 bg-[#63db54]" />
          </View>
        </View>

        <View className="items-center">
          <Image
            testID="thai-id-confirmation-image"
            source={dopaImage}
            className="h-[82px] w-[82px]"
            resizeMode="contain"
            accessibilityLabel="ThaID"
          />
          <Text className="mt-2 text-center text-[13px] font-extrabold text-black">กรมการปกครอง</Text>
        </View>

        <View className="mt-7 items-center gap-2">
          <Text className="text-center text-[11px] font-semibold text-black">เอกสาร  :  บัตรประชาชน</Text>
          <Text className="text-center text-[11px] font-semibold text-black">หน่วยงานที่รับรอง : กรมการปกครอง</Text>
        </View>

        <Pressable
          className="mt-8 h-9 min-w-[98px] items-center justify-center self-center rounded-full bg-[#18a05d] px-6"
          onPress={onConfirm}
        >
          <Text className="text-[13px] font-extrabold text-white">ยืนยัน</Text>
        </Pressable>
      </View>
    </View>
  )
}
