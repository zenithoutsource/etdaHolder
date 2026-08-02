import { Image, Text, View } from 'react-native'

import { DRIVING_LICENCE_IMAGE } from '../config/drivingLicenceSample'
import { readDrivingLicenceCardView } from '../services/credentials/drivingLicenceDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { DocumentCardLayout } from './DocumentCardLayout'

type DrivingLicenceDocumentCardProps = Readonly<{
  record: VerifiableCredentialRecord
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

export function DrivingLicenceDocumentCard({
  record,
  testID = 'driving-licence-card',
}: DrivingLicenceDocumentCardProps) {
  const view = readDrivingLicenceCardView(record)

  return (
    <View testID={testID}>
      <DocumentCardLayout
        primaryColor="#002887"
        banner={
          <View testID="driving-licence-header">
            <Text className="text-[15px] font-extrabold tracking-[1.5px] text-white">
              {view.documentTitle}
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
              <Text className="text-[14px] font-bold leading-5 text-wallet-navy">{view.thaiName}</Text>
              <Text className="text-[12px] leading-4 text-slate">{view.englishName}</Text>
              <Text className="mt-2 text-[10px] leading-[14px] text-blue-gray">Date of Birth / วันเกิด</Text>
              <Text className="text-[13px] font-bold leading-[18px] text-wallet-navy">{view.birthDate}</Text>
            </View>
          </View>
        }
        leftColumn={
          <View testID="driving-licence-left-column" className="gap-3">
            <DetailValue label="Type / ประเภท" value={view.type} />
            <DetailValue label="Vehicle type" value={view.englishType} />
            <DetailValue label="Licence No. / เลขที่ใบอนุญาต" value={view.licenceNumber} />
          </View>
        }
        rightColumn={
          <View testID="driving-licence-right-column" className="gap-3">
            <DetailValue label="Issue Date / วันที่ออก" value={view.issueDate} />
            <DetailValue label="Expiry Date / วันสิ้นอายุ" value={view.expiryDate} expiry />
          </View>
        }
      />
    </View>
  )
}
