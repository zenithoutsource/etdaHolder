import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'

export type PresentationResultItem = {
  key: string
  label: string
  status: 'verified' | 'used'
}

type Props = {
  verifierName: string
  items: PresentationResultItem[]
  onDone: () => void
}

export function PresentationResultPanel({ verifierName, items, onDone }: Props) {
  return (
    <View className="flex-1 items-center bg-green-50 px-6 pt-[100px]">
      <View
        testID="presentation-result-check"
        className="h-[98px] w-[98px] items-center justify-center rounded-full bg-green-500">
        <MaterialCommunityIcons name="check" size={72} color="#ffffff" />
      </View>
      <Text className="mt-7 text-center text-[18px] font-extrabold leading-6 text-black">ตรวจสอบสำเร็จ</Text>
      <Text className="mt-4 mb-4 text-center text-[14px] leading-5 text-[#364152]">
        ข้อมูลของคุณถูกส่งให้
        {'\n'} {verifierName}เรียบร้อยแล้ว
      </Text>

      

      <AppButton variant="solid-block" label="เสร็จสิ้น" onPress={onDone} className="mt-6 px-28 py-5" />
    </View>
  )
}
