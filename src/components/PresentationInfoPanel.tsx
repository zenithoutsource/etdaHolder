import { ScrollView, View } from 'react-native'

import { getWalletKeyRegisteredAt } from '../services/crypto/crypto'
import { readCompactTokenSignature } from '../services/vp/presentationEvidence'
import type { ResolvedPresentationRequest } from '../services/vp/presentationService'
import { PresentationApprovalDeviceCard } from './PresentationApprovalDeviceCard'
import { PresentationCredentialSummaryCard } from './PresentationCredentialSummaryCard'
import { PresentationPopCard } from './PresentationPopCard'
import { PresentationRequestedItemsCard } from './PresentationRequestedItemsCard'

type Props = {
  request: ResolvedPresentationRequest
  onConfirm: () => void
}

export function PresentationInfoPanel({ request, onConfirm }: Props) {
  const credentialSignature = readCompactTokenSignature(request.matchedCredential.rawVc) ?? 'Signature unavailable'

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32, gap: 16 }}>
        <PresentationCredentialSummaryCard record={request.matchedCredential} />
        <PresentationApprovalDeviceCard registeredAt={getWalletKeyRegisteredAt()} />
        <PresentationPopCard signature={credentialSignature} />
        <PresentationRequestedItemsCard disclosures={request.disclosures} onAccept={onConfirm} />
      </ScrollView>
    </View>
  )
}
