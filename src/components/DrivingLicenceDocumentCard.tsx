/**
 * Driving-licence document card layout (detail, issuance preview, OID4VP info).
 * Journey: Wallet detail; Scan claim preview; P4 PresentationInfoPanel.
 * Copy: drivingLicenceDisplay; holderProfile fills missing Thai name/birth date; English is MOCK_HOLDER_ENGLISH_NAME.
 * Layout: DocumentCardLayout, DocumentCardDetailValue.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

import type { ReactNode } from 'react'
import { Image, Text, View } from 'react-native'

import { DRIVING_LICENCE_IMAGE } from '../config/drivingLicenceSample'
import { readDrivingLicenceCardView } from '../services/credentials/drivingLicenceDisplay'
import type { CredentialHolderProfile } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { DocumentCardDetailValue } from './DocumentCardDetailValue'
import { DocumentCardLayout } from './DocumentCardLayout'

type DrivingLicenceDocumentCardProps = Readonly<{
  record: VerifiableCredentialRecord
  holderProfile?: CredentialHolderProfile
  bannerAction?: ReactNode
  testID?: string
}>

export function DrivingLicenceDocumentCard({
  record,
  holderProfile,
  bannerAction,
  testID = 'driving-licence-card',
}: DrivingLicenceDocumentCardProps) {
  const view = readDrivingLicenceCardView(record, holderProfile)

  return (
    <View testID={testID}>
      <DocumentCardLayout
        primaryColor="#002887"
        bannerAction={bannerAction}
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
              <Text className="text-[12px] leading-4 font-semibold text-wallet-navy">{view.englishName}</Text>
              <Text className="mt-2 text-[10px] leading-[14px] text-blue-gray">Date of Birth / วันเกิด</Text>
              <Text className="text-[13px] font-bold leading-[18px] text-wallet-navy">{view.birthDate}</Text>
            </View>
          </View>
        }
        leftColumn={
          <View testID="driving-licence-left-column" className="gap-3">
            <DocumentCardDetailValue
              label="Licence No. / เลขที่ใบอนุญาต"
              value={view.licenceNumber}
              testID="driving-licence-number"
            />
            <DocumentCardDetailValue label="ประเภทยานพาหนะ" value={view.type} />
            <DocumentCardDetailValue label="Vehicle type" value={view.englishType} />
          </View>
        }
        rightColumn={
          <View testID="driving-licence-right-column" className="gap-3">
            <DocumentCardDetailValue label="Issue Date / วันที่ออก" value={view.issueDate} />
            <DocumentCardDetailValue
              label="Expiry Date / วันสิ้นอายุ"
              value={view.expiryDate}
              expiry
              testID="driving-licence-expiry"
              accessibilityLabel={`Expiry Date: ${view.expiryDate}`}
            />
          </View>
        }
      />
    </View>
  )
}
