import * as Device from 'expo-device'
import { Text, View, Image, type ImageSourcePropType, } from 'react-native'

const phoneImage =
  require("../../assets/images/smartphone.png") as ImageSourcePropType;

type Props = {
  registeredAt?: string
}

function formatRegisteredAt(value?: string): { date: string; time: string } | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return undefined

  return {
    date: new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed),
    time: new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(parsed),
  }
}

export function PresentationApprovalDeviceCard({ registeredAt }: Props) {
  const registered = formatRegisteredAt(registeredAt)
  return (
    <View className="rounded-2xl bg-white p-4">
      <Text className="text-xl font-extrabold text-black">Approve by Wallet</Text>
      <View className="mt-3 flex-row items-center gap-3">
        <Image
          source={phoneImage}
          className="h-10 w-10"
          resizeMode="contain"
        />
        <View>
          <Text className="text-[13px] font-bold text-navy-deep">{Device.brand?.toLocaleUpperCase()}</Text>
          <Text className="text-[12px] text-gray500">Android {Device.osVersion}</Text>
        </View>
      </View>
      {registered ? (
        <Text className="mt-3 text-[12px] text-gray500">
          ลงทะเบียนเมื่อ <Text className="text-navy-deep font-bold">{registered.date} เวลา {registered.time} น.</Text>
        </Text>
      ) : null}
      <View className="mt-2 flex-row items-center gap-1.5">
        <Text className="text-[12px] text-gray500">สถานะการลงทะเบียน</Text>
        <Text className="text-[12px] font-bold text-navy-deep">{registered ? 'ลงทะเบียนแล้ว' : 'ยังไม่ลงทะเบียน'}</Text>
      </View>
    </View>
  )
}
