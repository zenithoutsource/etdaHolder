import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { readCredentialSummaryDisplay } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = {
  record: VerifiableCredentialRecord
}

export function ScanSuccessPanel({ record }: Props) {
  const display = readCredentialSummaryDisplay(record)

  return (
    <View className="flex-1 items-center bg-[#eef1f4] px-6 pt-[168px]">
      <View
        testID="scan-success-check"
        className="h-[98px] w-[98px] items-center justify-center rounded-full bg-[#19a957]">
        <MaterialCommunityIcons name="check" size={72} color="#ffffff" />
      </View>
      <Text className="mt-7 text-center text-[18px] font-extrabold leading-6 text-black">รับเอกสารสำเร็จ</Text>
      <Text className="mt-3 text-center text-[14px] font-bold leading-5 text-black">เอกสาร : {display.title}</Text>
      <Text className="mt-1 text-center text-[14px] font-bold leading-5 text-black">
        หน่วยงานที่รับรอง : {display.issuerName}
      </Text>
    </View>
  )
}
