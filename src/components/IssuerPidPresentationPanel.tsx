/**
 * Issuer-requested PID presentment consent with full PID card.
 * Journey: P4 same-device issuance PID VP (Oid4VpDisclosureFlow).
 * Copy: src/config/issuerPidPresentationCopy.ts
 * Layout: CredentialDocumentDetailCard.
 * Map: docs/CODEMAPS/frontend.md#oid4vp-request
 */

import { ScrollView, Text, View } from 'react-native'

import { ISSUER_PID_PRESENTATION_COPY } from '../config/issuerPidPresentationCopy'
import {
  readCredentialDetailDisplay,
  readCredentialHolderProfile,
} from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { AppButton } from './AppButton'
import { CredentialDocumentDetailCard } from './CredentialDocumentDetailCard'

type Props = Readonly<{
  record: VerifiableCredentialRecord
  onConfirm: () => void
  onDecline: () => void
  submitting?: boolean
}>

export function IssuerPidPresentationPanel({
  record,
  onConfirm,
  onDecline,
  submitting,
}: Props) {
  const display = readCredentialDetailDisplay(record)
  const holderProfile = readCredentialHolderProfile(record)

  return (
    <View testID="issuer-pid-presentation-panel" className="flex-1 bg-white px-4 pt-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="items-center pb-8">
        <Text className="mb-5 text-center text-[13px] leading-5 text-gray500">
          {ISSUER_PID_PRESENTATION_COPY.explanation}
        </Text>
        <View className="w-full max-w-[380px]">
          <CredentialDocumentDetailCard
            display={display}
            record={record}
            holderProfile={holderProfile}
          />
        </View>
        <AppButton
          variant="solid-block"
          label={ISSUER_PID_PRESENTATION_COPY.confirm}
          onPress={onConfirm}
          loading={submitting}
          className="mt-8 w-full py-4"
        />
        <AppButton
          variant="outline-block"
          label={ISSUER_PID_PRESENTATION_COPY.decline}
          onPress={onDecline}
          className="mt-3 w-full rounded-full border-gray300 py-4"
          textClassName="text-[15px] font-bold text-slate750"
        />
      </ScrollView>
    </View>
  )
}
