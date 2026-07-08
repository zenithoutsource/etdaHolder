import { Image, ScrollView, Text, View, type ImageSourcePropType } from 'react-native'

import { readCredentialHolderProfile } from '../services/credentials/credentialDisplay'
import { readCredentialPreviewDisplay } from '../services/vci/qrIssuanceFlow'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { AppButton } from './AppButton'

import { THEME } from '../config/themeColors'

type Props = {
  record: VerifiableCredentialRecord
  profileImage: ImageSourcePropType
  onAccept: () => void
}

type GridCell = { label: string; value?: string; red?: boolean }

export function TranscriptPreviewPanel({ record, profileImage, onAccept }: Props) {
  const preview = readCredentialPreviewDisplay(record)
  const profile = readCredentialHolderProfile(record)
  const getRow = (key: string) => preview.rows.find((r) => r.key === key)?.value
  const thaiFullName = profile.thaiName ?? ''
  const englishFullName = profile.englishName ?? ''
  const dob = profile.birthDate ?? getRow('birthDate')
  const studentId = getRow('studentId')
  const gpa = getRow('gpa')
  const faculty = getRow('faculty')
  const graduationYear = getRow('graduationYear')
  const degree = getRow('degree')
  const expiryDate = record.expiresAt
    ? new Date(record.expiresAt).toLocaleDateString('th-TH-u-ca-buddhist', { year: 'numeric', month: 'long', day: 'numeric' })
    : getRow('expiryDate')

  const gridRows: [GridCell, GridCell][] = [
    [
      { label: 'เลขประจำตัวนิสิต', value: studentId },
      { label: 'Cumulative GPA', value: gpa },
    ],
    [
      { label: 'คณะ', value: faculty },
      { label: 'Graduation Year :', value: graduationYear },
    ],
    [
      { label: 'สาขาวิชา', value: degree },
      { label: 'วันหมดอายุ / Expiry Date', value: expiryDate, red: true },
    ],
  ]

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View
          className="overflow-hidden rounded-2xl bg-white"
          style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
          <View className="bg-pink-deep px-5 py-3">
            <Text className="text-[15px] font-extrabold text-white">TRANSCRIPT</Text>
          </View>
          <View className="flex-row px-5 pb-4 pt-5">
            <Image source={profileImage} style={{ width: 90, height: 110, borderRadius: 8 }} resizeMode="contain" />
            <View className="ml-4 flex-1 justify-center">
              <Text className="text-[11px] text-gray-cool">ชื่อ - นามสกุล / Name</Text>
              <Text className="text-[14px] font-bold leading-5 text-navy-deep">{thaiFullName || '-'}</Text>
              <Text className="text-[12px] leading-4 text-gray-cool">{englishFullName}</Text>
              {dob ? (
                <>
                  <Text className="mt-3 text-[11px] text-gray-cool">วันเกิด / Date of Birth</Text>
                  <Text className="text-[14px] font-bold text-navy-deep">{dob}</Text>
                </>
              ) : null}
            </View>
          </View>
          <View className="mx-5 border-t border-gray200" />
          <View className="px-5 pb-5 pt-3">
            {gridRows.map((pair, i) => (
              <View key={i} className="mt-3 flex-row">
                {pair.map((cell, j) => (
                  <View key={j} className="flex-1">
                    <Text className="text-[11px] text-gray-cool">{cell.label}</Text>
                    <Text className={`text-[13px] font-bold ${cell.red === true ? 'text-danger' : 'text-navy-royal'}`}>
                      {cell.value ?? '-'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
        <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-11 !bg-success" />
      </ScrollView>
    </View>
  )
}
