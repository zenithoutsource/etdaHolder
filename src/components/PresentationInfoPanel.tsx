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
  selectedClaimKeys: ReadonlySet<string>
  onToggleClaim: (claimKey: string) => void
  onConfirm: () => void
  submitting?: boolean
}

export function PresentationInfoPanel({
  request,
  selectedClaimKeys,
  onToggleClaim,
  onConfirm,
  submitting,
}: Props) {
  const credentialSignature = readCompactTokenSignature(request.matchedCredential.rawVc) ?? 'Signature unavailable'

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32, gap: 16 }}>
        <PresentationCredentialSummaryCard record={request.matchedCredential} />
        <PresentationApprovalDeviceCard registeredAt={getWalletKeyRegisteredAt()} />
        <PresentationPopCard signature={credentialSignature} />
        <PresentationRequestedItemsCard
          documentType={request.matchedCredential.type}
          disclosures={request.disclosures}
          selectedClaimKeys={selectedClaimKeys}
          onToggleClaim={onToggleClaim}
          onAccept={onConfirm}
          submitting={submitting}
        />
      </ScrollView>
    </View>
  )
}
