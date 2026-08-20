/**
 * PID receive preview card plus confirm.
 * Journey: P1 claim preview phase.
 * Copy: cardSchemas; credentialDisplay.
 * Layout: DocumentCardLayout, CredentialFieldRow.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import { Image, ScrollView, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { CredentialFieldRow } from './CredentialFieldRow'
import { DocumentCardLayout } from './DocumentCardLayout'
import { getCardSchema } from '../config/cardSchemas'
import { readCredentialHolderProfile, readDisplayValue } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

const portraitImage = require('../../assets/images/user_profile.png') as ImageSourcePropType

type Props = { record: VerifiableCredentialRecord; onConfirm: () => void }

export function ThaiIdReceivePanel({ record, onConfirm }: Props) {
  const schema = getCardSchema(record.type)
  const profile = readCredentialHolderProfile(record)
  const findValue = (key: string) => {
    const field = schema.displayFields.find((item) => item.key === key)
    return field ? readDisplayValue(record.claims, field) : undefined
  }
  const nationalId = findValue('nationalId')
  const birthDate = findValue('birthDate') ?? profile.birthDate
  const address = findValue('address')
  const expiryDate = findValue('expiryDate')

  return (
    <View className="flex-1 items-center bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} className="w-full" contentContainerClassName="items-center pb-8">
        <View testID="thai-id-receive-content" className="w-full max-w-[380px]">
          <View testID="thai-id-receive-panel">
            <DocumentCardLayout
              primaryColor={schema.primaryColor}
              banner={<Text className="text-[15px] font-extrabold text-white">{schema.documentTitle}</Text>}
              hero={<View className="flex-row"><Image testID="thai-id-receive-photo" source={portraitImage} className="h-[114px] w-24 rounded-lg" resizeMode="cover" /><View className="ml-4 flex-1 justify-center"><Text className="text-[11px] text-gray-cool">ชื่อ - นามสกุล</Text><Text className="text-[14px] font-extrabold text-navy-deep">{profile.thaiName ?? '-'}</Text><Text className="text-[12px] text-gray-cool">{profile.englishName ?? '-'}</Text><Text className="mt-3 text-[11px] text-gray-cool">เลขบัตรประจำตัวประชาชน</Text><Text className="text-[14px] font-extrabold text-navy-deep">{nationalId ?? '-'}</Text></View></View>}
              leftColumn={<View><CredentialFieldRow label="วันเดือนปีเกิด" value={birthDate} divider={false} /><CredentialFieldRow label="ที่อยู่ตามบัตรประชาชน" value={address} /></View>}
              rightColumn={<View><CredentialFieldRow label="วันหมดอายุ" value={expiryDate} divider={false} /></View>}
            />
          </View>
          <AppButton variant="solid-block" label="ยืนยัน" onPress={onConfirm} className="mt-5 h-11 !bg-success" />
        </View>
      </ScrollView>
    </View>
  )
}
