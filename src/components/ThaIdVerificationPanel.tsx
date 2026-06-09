import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native'

const thaidImage = require('../../assets/images/thaid.png') as ImageSourcePropType

type Props = {
  onContinue: () => void
}

export function ThaIdVerificationPanel({ onContinue }: Props) {
  return (
    <View className="flex-1 items-center bg-[#eef1f4] px-6 pt-16 mt-">
      <View className="w-full max-w-[330px] items-center rounded-[16px] bg-white px-6 py-8 mt-20 border-8 border-blue-800">
        <Text className="mb-2 text-center text-[20px] font-extrabold leading-7 text-black">
          ยืนยันตัวตนผ่าน
        </Text>
        <Text className="mb-6 text-center text-[20px] font-extrabold leading-7 text-black">
          ThaID
        </Text>
        <Image
          testID="thaid-verification-image"
          source={thaidImage}
          className="h-[128px] w-[128px] rounded-3xl"
          resizeMode="contain"
          accessibilityLabel="ThaID"
        />
        <Pressable
          className="mt-8 h-11 min-w-[132px] items-center justify-center rounded-full bg-[#18a05d] px-6"
          onPress={onContinue}
        >
          <Text className="text-[15px] font-extrabold text-white">ยืนยัน</Text>
        </Pressable>
      </View>
    </View>
  )
}
