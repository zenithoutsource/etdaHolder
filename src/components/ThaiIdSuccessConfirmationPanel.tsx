import { Image, View, type ImageSourcePropType } from 'react-native'

import { TrustConfirmationCard } from './TrustConfirmationCard'
import { getCardSchema, type IssuanceConfirmationConfig } from '../config/cardSchemas'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

const confirmationImages: Record<IssuanceConfirmationConfig['imageKey'], ImageSourcePropType> = {
  dopa: require('../../assets/images/dopa.png'),
}
const ribbonBadgeImage = require('../../assets/images/ribbon_badge.png') as ImageSourcePropType
const DEFAULT_CONFIRMATION: IssuanceConfirmationConfig = {
  documentLabel: 'บัตรประชาชน',
  issuerLabel: 'กรมการปกครอง',
  imageKey: 'dopa',
}

type Props = { record: VerifiableCredentialRecord; onConfirm: () => void }

export function ThaiIdSuccessConfirmationPanel({ record, onConfirm }: Props) {
  const confirmation = getCardSchema(record.type).issuanceConfirmation ?? DEFAULT_CONFIRMATION

  return (
    <TrustConfirmationCard
      image={confirmationImages[confirmation.imageKey]}
      imageTestID="thai-id-confirmation-image"
      imageClassName="h-[82px] w-[82px]"
      issuerLabel={confirmation.issuerLabel}
      documentLabel={confirmation.documentLabel}
      onConfirm={onConfirm}
      badge={<View testID="thai-id-confirmation-badge" className="absolute -right-16 -top-12 items-center"><Image source={ribbonBadgeImage} className="h-[150px] w-[150px]" resizeMode="contain" /></View>}
    />
  )
}
