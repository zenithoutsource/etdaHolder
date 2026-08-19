import type { ImageSourcePropType } from 'react-native'

import { getCardSchema } from './cardSchemas'
import { inferCredentialTypeFromDocumentType } from './historyDisplayNames'

export type HistoryIssuerLogoKey = NonNullable<
  ReturnType<typeof getCardSchema>['issuerLogoKey']
>

export const HISTORY_ISSUER_LOGO_IMAGES: Record<HistoryIssuerLogoKey, ImageSourcePropType> = {
  thaid: require('../../assets/images/thaid.png'),
  dltt: require('../../assets/images/dltt.png'),
  chulalongkorn: require('../../assets/images/chulalongkorn.png'),
}

export function readHistoryIssuerLogoKey(
  credentialType?: string,
  documentType?: string,
): HistoryIssuerLogoKey | undefined {
  const type = credentialType || (documentType ? inferCredentialTypeFromDocumentType(documentType) : undefined)
  if (!type) return undefined
  return getCardSchema(type).issuerLogoKey
}

export function readHistoryIssuerLogoSource(
  credentialType?: string,
  documentType?: string,
): ImageSourcePropType | undefined {
  const key = readHistoryIssuerLogoKey(credentialType, documentType)
  return key ? HISTORY_ISSUER_LOGO_IMAGES[key] : undefined
}
