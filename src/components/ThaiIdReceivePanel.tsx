import { Image, ScrollView, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { CredentialFieldRow } from './CredentialFieldRow'
import { getCardSchema } from '../config/cardSchemas'
import { readCredentialHolderProfile, readDisplayValue } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

import { THEME } from '../config/themeColors'

const portraitImage = require('../../assets/images/user_profile.png') as ImageSourcePropType

type Props = {
  record: VerifiableCredentialRecord
  onConfirm: () => void
}

export function ThaiIdReceivePanel({ record, onConfirm }: Props) {
  const schema = getCardSchema(record.type)
  const profile = readCredentialHolderProfile(record)
  const findField = (key: string) => schema.displayFields.find((field) => field.key === key)
  const nationalId = findField('nationalId') ? readDisplayValue(record.claims, findField('nationalId')!) : undefined
  const birthDate = findField('birthDate') ? readDisplayValue(record.claims, findField('birthDate')!) : profile.birthDate
  const religion = findField('religion') ? readDisplayValue(record.claims, findField('religion')!) : undefined
  const address = findField('address') ? readDisplayValue(record.claims, findField('address')!) : undefined

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View
          testID="thai-id-receive-panel"
          className="overflow-hidden rounded-2xl bg-white"
          style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
          <View className="bg-navy-royal px-5 py-3">
            <Text className="text-[15px] font-extrabold text-white">{schema.documentTitle}</Text>
          </View>
          <View className="px-5 pb-4 pt-5">
            <View className="items-center">
              <Image
                testID="thai-id-receive-photo"
                source={portraitImage}
                style={{ width: 96, height: 114, borderRadius: 8 }}
                resizeMode="cover"
              />
            </View>

            <View className="mt-4">
              <Text className="text-[11px] leading-[18px] text-gray-cool">ชื่อ - นามสกุล</Text>
              <Text className="text-[14px] font-extrabold leading-[22px] text-navy-deep">{profile.thaiName ?? '-'}</Text>
              {profile.englishName ? (
                <Text className="text-[12px] leading-[18px] text-gray-cool">{profile.englishName}</Text>
              ) : null}
            </View>

            <CredentialFieldRow label="เลขบัตรประจำตัวประชาชน" value={nationalId} />
            <CredentialFieldRow label="วันเดือนปีเกิด" value={birthDate} />
            <CredentialFieldRow label="ศาสนา" value={religion} />
            <CredentialFieldRow label="ที่อยู่ตามทะเบียนบ้าน" value={address} />

            <AppButton variant="solid-block" label="ยืนยัน" onPress={onConfirm} className="mt-6 h-11 self-center !bg-success px-10" />
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
