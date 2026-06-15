import { type ImageSourcePropType } from 'react-native'

import { TrustConfirmationCard } from './TrustConfirmationCard'

const dopaImage =
  require("../../assets/images/dopa.png") as ImageSourcePropType;

type Props = {
  documentLabel: string
  issuerLabel: string
  onConfirm: () => void
}

export function VerifierTrustPanel({ documentLabel, issuerLabel, onConfirm }: Props) {
  return (
    <TrustConfirmationCard
      image={dopaImage}
      issuerLabel={"กรมการปกครอง"}
      documentLabel={documentLabel}
      onConfirm={onConfirm}
    />
  )
}
