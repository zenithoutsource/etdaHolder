import { Image, ScrollView, Text, View, type ImageSourcePropType } from 'react-native'

import { readCredentialHolderProfile } from '../services/credentials/credentialDisplay'
import { readCredentialPreviewDisplay } from '../services/vci/qrIssuanceFlow'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { AppButton } from './AppButton'

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
    ? new Date(record.expiresAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
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
    <View className="flex-1 bg-[#eef1f4] px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View
          className="overflow-hidden rounded-2xl bg-white"
          style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
          <View className="bg-[#cc0066] px-5 py-3">
            <Text className="text-[15px] font-extrabold text-white">TRANSCRIPT</Text>
          </View>
          <View className="flex-row px-5 pb-4 pt-5">
            <Image source={profileImage} style={{ width: 90, height: 110, borderRadius: 8 }} resizeMode="contain" />
            <View className="ml-4 flex-1 justify-center">
              <Text className="text-[11px] text-[#9aa1ad]">ชื่อ - นามสกุล / Name</Text>
              <Text className="text-[14px] font-bold leading-5 text-[#071f5f]">{thaiFullName || '-'}</Text>
              <Text className="text-[12px] leading-4 text-[#9aa1ad]">{englishFullName}</Text>
              {dob ? (
                <>
                  <Text className="mt-3 text-[11px] text-[#9aa1ad]">วันเกิด / Date of Birth</Text>
                  <Text className="text-[14px] font-bold text-[#071f5f]">{dob}</Text>
                </>
              ) : null}
            </View>
          </View>
          <View className="mx-5 border-t border-[#e5e7eb]" />
          <View className="px-5 pb-5 pt-3">
            {gridRows.map((pair, i) => (
              <View key={i} className="mt-3 flex-row">
                {pair.map((cell, j) => (
                  <View key={j} className="flex-1">
                    <Text className="text-[11px] text-[#9aa1ad]">{cell.label}</Text>
                    <Text className={`text-[13px] font-bold ${cell.red === true ? 'text-[#c00000]' : 'text-[#123b8c]'}`}>
                      {cell.value ?? '-'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
        <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-11 !bg-[#18a05d]" />
      </ScrollView>
    </View>
  )
}
