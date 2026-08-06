import { Text, View } from 'react-native'

import type { PresentationDisclosure } from '../services/vp/presentationService'
import { AppButton } from './AppButton'
import {
  hasSelectedClaims,
  isToggleablePresentationDisclosure,
  readConsentItems,
} from './PresentationConsentPanel'
import { PresentationDisclosureList } from './PresentationDisclosureList'

type Props = {
  documentType: string
  disclosures: PresentationDisclosure[]
  selectedClaimKeys: ReadonlySet<string>
  onToggleClaim: (claimKey: string) => void
  onAccept: () => void
  submitting?: boolean
}

export function PresentationRequestedItemsCard({
  documentType,
  disclosures,
  selectedClaimKeys,
  onToggleClaim,
  onAccept,
  submitting,
}: Props) {
  const consentItems = readConsentItems(disclosures, selectedClaimKeys, documentType)
  const hasToggleableItems = consentItems.some((item) => item.toggleable === true)

  const handleToggle = (claimKey: string) => {
    const disclosure = disclosures.find((entry) => entry.key === claimKey)
    if (!disclosure || !isToggleablePresentationDisclosure(disclosure)) return
    onToggleClaim(claimKey)
  }

  return (
    <View>
      <Text className="text-[13px] font-extrabold text-navy-deep">รายการที่ร้องขอ</Text>
      {hasToggleableItems ? (
        <Text className="mt-1 text-[12px] text-gray500">เลือกรายการเพื่อส่งตรวจสอบ</Text>
      ) : null}
      <View className="mt-2">
        <PresentationDisclosureList
          items={consentItems}
          variant="review"
          onToggle={handleToggle}
        />
      </View>
      <AppButton
        variant="solid-block"
        label="ยอมรับ"
        onPress={onAccept}
        disabled={!hasSelectedClaims(disclosures, selectedClaimKeys)}
        loading={submitting}
        className="mt-5 h-12"
      />
    </View>
  )
}
