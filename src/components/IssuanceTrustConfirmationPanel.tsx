/**
 * Schema-driven “trust this issuer/document” confirmation step.
 * Journey: P1 claim; PID via ThaiIdSuccessConfirmationPanel.
 * Copy: cardSchemas issuanceConfirmation.
 * Layout: TrustConfirmationCard.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import { Image, View, type ImageSourcePropType } from 'react-native'

import {
  getCardSchema,
  type IssuanceConfirmationConfig,
} from '../config/cardSchemas'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { TrustConfirmationCard } from './TrustConfirmationCard'

const confirmationImages: Record<IssuanceConfirmationConfig['imageKey'], ImageSourcePropType> = {
  dopa: require('../../assets/images/dopa.png'),
  dltt: require('../../assets/images/dltt.png'),
  chulalongkorn: require('../../assets/images/chulalongkorn.png'),
  profile: require('../../assets/images/profile.png'),
}

const PID_CONFIRMATION: IssuanceConfirmationConfig = {
  documentLabel: 'บัตรประชาชน',
  issuerLabel: 'กรมการปกครอง',
  imageKey: 'dopa',
  accent: 'navy',
}

const FALLBACK_ISSUER_CONFIRMATION: IssuanceConfirmationConfig = {
  documentLabel: 'เอกสาร',
  issuerLabel: 'หน่วยงานที่รับรอง',
  imageKey: 'profile',
  accent: 'navy',
}

type Props = Readonly<{
  variant: 'pidDopa' | 'issuer'
  record?: VerifiableCredentialRecord
  credentialType?: string
  onConfirm: () => void
}>

function readIssuerConfirmation(
  record: VerifiableCredentialRecord | undefined,
  credentialType: string | undefined,
): IssuanceConfirmationConfig {
  if (!record?.type && !credentialType) {
    return FALLBACK_ISSUER_CONFIRMATION
  }

  const schema = getCardSchema(record?.type ?? credentialType ?? 'ThaiNationalID')
  return schema.issuanceConfirmation ?? {
    ...FALLBACK_ISSUER_CONFIRMATION,
    documentLabel: schema.title,
    issuerLabel: schema.issuerName,
  }
}

export function IssuanceTrustConfirmationPanel({
  variant,
  record,
  credentialType,
  onConfirm,
}: Props) {
  const confirmation = variant === 'pidDopa'
    ? getCardSchema('ThaiNationalID').issuanceConfirmation ?? PID_CONFIRMATION
    : readIssuerConfirmation(record, credentialType)
  const testIDPrefix = variant === 'pidDopa' ? 'thai-id-confirmation' : 'issuer-confirmation'

  return (
    <TrustConfirmationCard
      image={confirmationImages[confirmation.imageKey]}
      imageTestID={`${testIDPrefix}-image`}
      imageClassName="h-[82px] w-[82px]"
      issuerLabel={confirmation.issuerLabel}
      documentLabel={confirmation.documentLabel}
      onConfirm={onConfirm}
      accent={confirmation.accent}
      badge={
        <View testID={`${testIDPrefix}-badge`} className="absolute -right-16 -top-12 items-center">
          <Image source={require('../../assets/images/ribbon_badge.png')} className="h-[150px] w-[150px]" resizeMode="contain" />
        </View>
      }
    />
  )
}
