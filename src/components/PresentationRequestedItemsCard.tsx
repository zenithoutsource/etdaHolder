import { Text, View } from 'react-native'

import { resolvePresentationDisclosureLabel } from '../config/cardSchemas'
import type { PresentationDisclosure } from '../services/vp/presentationService'
import { AppButton } from './AppButton'
import { PresentationDisclosureList } from './PresentationDisclosureList'

type Props = {
  documentType: string
  disclosures: PresentationDisclosure[]
  onAccept: () => void
}

export function PresentationRequestedItemsCard({ documentType, disclosures, onAccept }: Props) {
  return (
    <View>
      <Text className="text-[13px] font-extrabold text-navy-deep">รายการที่ร้องขอ</Text>
      <View className="mt-2">
        <PresentationDisclosureList
          items={disclosures.map((disclosure) => ({
            key: disclosure.key,
            label: resolvePresentationDisclosureLabel(documentType, disclosure.key),
            value: disclosure.value,
          }))}
          variant="review"
        />
      </View>
      <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-12" />
    </View>
  )
}
