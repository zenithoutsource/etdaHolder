import { Image, ScrollView, Text, View, type ImageSourcePropType } from 'react-native'

import { AppButton } from './AppButton'
import { DocumentCardLayout } from './DocumentCardLayout'
import { readCredentialHolderProfile } from '../services/credentials/credentialDisplay'
import { readCredentialPreviewDisplay } from '../services/vci/qrIssuanceFlow'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { THEME } from '../config/themeColors'

type Props = { record: VerifiableCredentialRecord; profileImage: ImageSourcePropType; onAccept: () => void }
type DetailValueProps = { label: string; value?: string; critical?: boolean }

function DetailValue({ label, value, critical = false }: DetailValueProps) {
  return <View className="mb-3"><Text className={`text-[11px] text-gray-cool ${critical ? 'text-danger' : ''}`}>{label}</Text><Text className={`text-[13px] font-bold ${critical ? 'text-danger' : 'text-navy-royal'}`}>{value ?? '-'}</Text></View>
}

export function TranscriptPreviewPanel({ record, profileImage, onAccept }: Props) {
  const preview = readCredentialPreviewDisplay(record)
  const profile = readCredentialHolderProfile(record)
  const getRow = (key: string) => preview.rows.find((row) => row.key === key)?.value
  const birthDate = profile.birthDate ?? getRow('birthDate')
  const expiryDate = record.expiresAt ? new Date(record.expiresAt).toLocaleDateString('th-TH-u-ca-buddhist', { year: 'numeric', month: 'long', day: 'numeric' }) : getRow('expiryDate')

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <DocumentCardLayout
          primaryColor={THEME.pinkDeep}
          banner={<Text className="text-[15px] font-extrabold text-white">TRANSCRIPT</Text>}
          hero={<View className="flex-row"><Image source={profileImage} className="h-[110px] w-[90px] rounded-lg" resizeMode="cover" /><View className="ml-4 flex-1 justify-center"><Text className="text-[11px] text-gray-cool">ชื่อ - นามสกุล / Name</Text><Text className="text-[14px] font-bold text-navy-deep">{profile.thaiName ?? '-'}</Text><Text className="text-[12px] text-gray-cool">{profile.englishName ?? ''}</Text>{birthDate ? <><Text className="mt-3 text-[11px] text-gray-cool">วันเกิด / Date of Birth</Text><Text className="text-[14px] font-bold text-navy-deep">{birthDate}</Text></> : null}</View></View>}
          leftColumn={<View><DetailValue label="เลขประจำตัวนิสิต" value={getRow('studentId')} /><DetailValue label="คณะ" value={getRow('faculty')} /><DetailValue label="สาขาวิชา" value={getRow('degree')} /></View>}
          rightColumn={<View><DetailValue label="Cumulative GPA" value={getRow('gpa')} /><DetailValue label="Graduation Year" value={getRow('graduationYear')} /><DetailValue label="วันหมดอายุ / Expiry Date" value={expiryDate} critical /></View>}
        />
        <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-11 !bg-success" />
      </ScrollView>
    </View>
  )
}
