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
  const religion = findValue('religion')
  const address = findValue('address')
  const expiryDate = findValue('expiryDate')

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View testID="thai-id-receive-panel">
          <DocumentCardLayout
            primaryColor={schema.primaryColor}
            banner={<Text className="text-[15px] font-extrabold text-white">{schema.documentTitle}</Text>}
            hero={<View className="flex-row"><Image testID="thai-id-receive-photo" source={portraitImage} className="h-[114px] w-24 rounded-lg" resizeMode="cover" /><View className="ml-4 flex-1 justify-center"><Text className="text-[11px] text-gray-cool">ชื่อ - นามสกุล</Text><Text className="text-[14px] font-extrabold text-navy-deep">{profile.thaiName ?? '-'}</Text>{profile.englishName ? <Text className="text-[12px] text-gray-cool">{profile.englishName}</Text> : null}<Text className="mt-3 text-[11px] text-gray-cool">เลขบัตรประจำตัวประชาชน</Text><Text className="text-[14px] font-extrabold text-navy-deep">{nationalId ?? '-'}</Text></View></View>}
            leftColumn={<View><CredentialFieldRow label="วันเดือนปีเกิด" value={birthDate} divider={false} /><CredentialFieldRow label="ที่อยู่ตามทะเบียนบ้าน" value={address} /></View>}
            rightColumn={<View><CredentialFieldRow label="ศาสนา" value={religion} divider={false} /><CredentialFieldRow label="วันหมดอายุ" value={expiryDate} /></View>}
          />
        </View>
        <AppButton variant="solid-block" label="ยืนยัน" onPress={onConfirm} className="mt-5 h-11 !bg-success" />
      </ScrollView>
    </View>
  )
}
