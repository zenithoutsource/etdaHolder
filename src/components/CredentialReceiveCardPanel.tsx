/**
 * Receive-preview chrome: the same document face as credential detail, plus confirm.
 * Journey: P1 claim preview (ThaiIdReceivePanel, DrivingLicencePreviewPanel, TranscriptPreviewPanel).
 * Copy: confirm label from the parent phase. Layout: CredentialDocumentDetailCard (no My QR/NFC).
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import { ScrollView, View } from 'react-native'

import { AppButton } from './AppButton'
import { CredentialDocumentDetailCard } from './CredentialDocumentDetailCard'
import {
  readCredentialDetailDisplay,
  type CredentialHolderProfile,
} from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type CredentialReceiveCardPanelProps = Readonly<{
  record: VerifiableCredentialRecord
  holderProfile?: CredentialHolderProfile
  confirmLabel: string
  onConfirm: () => void
  testID: string
  contentTestID: string
}>

export function CredentialReceiveCardPanel({
  record,
  holderProfile,
  confirmLabel,
  onConfirm,
  testID,
  contentTestID,
}: CredentialReceiveCardPanelProps) {
  const display = readCredentialDetailDisplay(record)

  return (
    <View testID={testID} className="flex-1 items-center bg-surface px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} className="w-full" contentContainerClassName="items-center pb-8">
        <View testID={contentTestID} className="w-full max-w-[380px]">
          <CredentialDocumentDetailCard
            display={display}
            record={record}
            holderProfile={holderProfile}
          />
          <AppButton variant="solid-block" label={confirmLabel} onPress={onConfirm} className="mt-5 h-11 !bg-success" />
        </View>
      </ScrollView>
    </View>
  )
}
