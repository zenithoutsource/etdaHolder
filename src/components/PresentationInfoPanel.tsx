/**
 * Pre-submit review — document card, device, PoP, requested items.
 * Journey: P4 Oid4VpDisclosureFlow info phase.
 * Layout: CredentialDocumentDetailCard, ApprovalDeviceCard, PopCard, RequestedItemsCard.
 * Map: docs/CODEMAPS/frontend.md#oid4vp-request
 */

import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'

import { useStoredCredentials } from '../hooks/useStoredCredentials'
import {
  readCredentialDetailDisplay,
  resolveDisplayHolderProfile,
} from '../services/credentials/credentialDisplay'
import { getWalletKeyRegisteredAt } from '../services/crypto/crypto'
import { readCompactTokenSignature } from '../services/vp/presentationEvidence'
import type { ResolvedPresentationRequest } from '../services/vp/presentationService'
import { CredentialDocumentDetailCard } from './CredentialDocumentDetailCard'
import { PresentationApprovalDeviceCard } from './PresentationApprovalDeviceCard'
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
  const { credentials } = useStoredCredentials()
  const record = request.matchedCredential
  const display = readCredentialDetailDisplay(record)
  const holderProfile = useMemo(
    () => resolveDisplayHolderProfile(record, credentials),
    [credentials, record],
  )
  const credentialSignature = readCompactTokenSignature(record.rawVc) ?? 'Signature unavailable'

  return (
    <View className="flex-1 bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
        <CredentialDocumentDetailCard
          display={display}
          record={record}
          holderProfile={holderProfile}
        />
        <PresentationApprovalDeviceCard registeredAt={getWalletKeyRegisteredAt()} />
        <PresentationPopCard signature={credentialSignature} />
        <PresentationRequestedItemsCard
          documentType={record.type}
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
