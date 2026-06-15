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

type Props = {
  record: VerifiableCredentialRecord
  onConfirm: () => void
}

export function ThaiIdSuccessConfirmationPanel({ record, onConfirm }: Props) {
  const schema = getCardSchema(record.type)
  const confirmation = schema.issuanceConfirmation ?? DEFAULT_CONFIRMATION
  const confirmationImage = confirmationImages[confirmation.imageKey]

  return (
    <TrustConfirmationCard
      image={confirmationImage}
      imageTestID="thai-id-confirmation-image"
      imageClassName="h-[82px] w-[82px]"
      issuerLabel={confirmation.issuerLabel}
      documentLabel={confirmation.documentLabel}
      onConfirm={onConfirm}
      badge={
        <View className="absolute -right-16 -top-12 items-center">
          <Image source={ribbonBadgeImage} className="h-[150px] w-[150px]" resizeMode="contain" />
        </View>
      }
    />
  )
}
