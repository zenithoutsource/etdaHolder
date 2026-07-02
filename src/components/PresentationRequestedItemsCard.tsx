import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { PresentationDisclosureList } from './PresentationDisclosureList'
import type { PresentationDisclosure } from '../services/vp/presentationService'

type Props = {
  disclosures: PresentationDisclosure[]
  onAccept: () => void
}

export function PresentationRequestedItemsCard({ disclosures, onAccept }: Props) {
  return (
    <View>
      <Text className="text-[13px] font-extrabold text-[#071f5f]">รายการที่ร้องขอ</Text>
      <View className="mt-2">
        <PresentationDisclosureList items={disclosures} variant="review" />
      </View>
      <AppButton variant="solid-block" label="ยอมรับ" onPress={onAccept} className="mt-5 h-12" />
    </View>
  )
}
