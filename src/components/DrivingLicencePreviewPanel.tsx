import { ScrollView, View } from 'react-native'

import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { AppButton } from './AppButton'
import { DrivingLicenceDocumentCard } from './DrivingLicenceDocumentCard'

type DrivingLicencePreviewPanelProps = Readonly<{
  record: VerifiableCredentialRecord
  onAccept: () => void
}>

export function DrivingLicencePreviewPanel({ record, onAccept }: DrivingLicencePreviewPanelProps) {
  return (
    <View testID="driving-licence-preview-panel" className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <DrivingLicenceDocumentCard record={record} />
        <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-11 !bg-success" />
      </ScrollView>
    </View>
  )
}
