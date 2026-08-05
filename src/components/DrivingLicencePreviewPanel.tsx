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
    <View testID="driving-licence-preview-panel" className="flex-1 items-center bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} className="w-full" contentContainerClassName="items-center pb-8">
        <View testID="driving-licence-preview-content" className="w-full max-w-[380px]">
          <DrivingLicenceDocumentCard record={record} />
          <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-11 !bg-success" />
        </View>
      </ScrollView>
    </View>
  )
}
