import { Image, Text, View } from 'react-native'

import { DRIVING_LICENCE_IMAGE, DRIVING_LICENCE_SAMPLE } from '../config/drivingLicenceSample'
import { DocumentCardLayout } from './DocumentCardLayout'

type DrivingLicenceDocumentCardProps = Readonly<{
  testID?: string
}>

function DetailValue({ label, value, expiry = false }: Readonly<{ label: string; value: string; expiry?: boolean }>) {
  return (
    <View className="gap-0.5">
      <Text className={`text-[10px] leading-[14px] ${expiry ? 'text-danger' : 'text-blue-gray'}`}>{label}</Text>
      <Text
        testID={expiry ? 'driving-licence-expiry' : undefined}
        accessibilityLabel={expiry ? `Expiry Date: ${value}` : undefined}
        className={`text-[13px] font-bold leading-[18px] ${expiry ? 'text-danger' : 'text-wallet-navy'}`}>
        {value}
      </Text>
    </View>
  )
}

export function DrivingLicenceDocumentCard({ testID = 'driving-licence-card' }: DrivingLicenceDocumentCardProps) {
  return (
    <View testID={testID}>
      <DocumentCardLayout
        primaryColor="#002887"
        banner={
          <View testID="driving-licence-header">
            <Text className="text-[15px] font-extrabold tracking-[1.5px] text-white">
              {DRIVING_LICENCE_SAMPLE.documentTitle}
            </Text>
          </View>
        }
        hero={
          <View testID="driving-licence-hero" className="flex-row">
            <Image
              testID="driving-licence-image"
              source={DRIVING_LICENCE_IMAGE}
              className="h-[112px] w-[88px] rounded-lg"
              resizeMode="cover"
              accessibilityLabel="Driving licence portrait"
            />
            <View className="ml-4 flex-1 justify-center gap-0.5">
              <Text className="text-[10px] leading-[14px] text-blue-gray">Name / ชื่อ-นามสกุล</Text>
              <Text className="text-[14px] font-bold leading-5 text-wallet-navy">{DRIVING_LICENCE_SAMPLE.thaiName}</Text>
              <Text className="text-[12px] leading-4 text-slate">{DRIVING_LICENCE_SAMPLE.englishName}</Text>
              <Text className="mt-2 text-[10px] leading-[14px] text-blue-gray">Date of Birth / วันเกิด</Text>
              <Text className="text-[13px] font-bold leading-[18px] text-wallet-navy">{DRIVING_LICENCE_SAMPLE.birthDate}</Text>
            </View>
          </View>
        }
        leftColumn={
          <View testID="driving-licence-left-column" className="gap-3">
            <DetailValue label="Type / ประเภท" value={DRIVING_LICENCE_SAMPLE.type} />
            <DetailValue label="Vehicle type" value={DRIVING_LICENCE_SAMPLE.englishType} />
            <DetailValue label="Licence No. / เลขที่ใบอนุญาต" value={DRIVING_LICENCE_SAMPLE.licenceNumber} />
          </View>
        }
        rightColumn={
          <View testID="driving-licence-right-column" className="gap-3">
            <DetailValue label="Issue Date / วันที่ออก" value={DRIVING_LICENCE_SAMPLE.issueDate} />
            <DetailValue label="Expiry Date / วันสิ้นอายุ" value={DRIVING_LICENCE_SAMPLE.expiryDate} expiry />
          </View>
        }
      />
    </View>
  )
}
