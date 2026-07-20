import { ScrollView, View } from 'react-native'

import { AppButton } from './AppButton'
import { DrivingLicenceDocumentCard } from './DrivingLicenceDocumentCard'

type DrivingLicencePreviewPanelProps = Readonly<{
  onAccept: () => void
}>

export function DrivingLicencePreviewPanel({ onAccept }: DrivingLicencePreviewPanelProps) {
  return (
    <View testID="driving-licence-preview-panel" className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <DrivingLicenceDocumentCard />
        <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-11 !bg-success" />
      </ScrollView>
    </View>
  )
}
