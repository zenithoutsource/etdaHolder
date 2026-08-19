import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Image, View } from 'react-native'

import {
  readHistoryIssuerLogoSource,
} from '../config/historyIssuerLogos'
import { THEME } from '../config/themeColors'

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap

type HistoryIssuerLogoProps = {
  credentialType?: string
  documentType: string
  partyName: string
  logoTestID?: string
  iconTestID?: string
}

function readIssuerIcon(documentType: string): MaterialIconName {
  if (/driving|licence|license|ขับขี่/i.test(documentType)) {
    return 'card-account-details-outline'
  }
  if (/transcript|academic|ผลการเรียน/i.test(documentType)) return 'school-outline'
  if (/id|national|ประชาชน/i.test(documentType)) return 'account-card-outline'
  return 'file-document-outline'
}

export function HistoryIssuerLogo({
  credentialType,
  documentType,
  partyName,
  logoTestID = 'history-item-issuer-logo',
  iconTestID = 'history-item-issuer-icon',
}: HistoryIssuerLogoProps) {
  const source = readHistoryIssuerLogoSource(credentialType, documentType)

  return (
    <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-tint">
      {source ? (
        <Image
          testID={logoTestID}
          source={source}
          className="h-10 w-10"
          resizeMode="contain"
          accessibilityLabel={`${partyName} โลโก้`}
        />
      ) : (
        <View testID={iconTestID}>
          <MaterialCommunityIcons
            name={readIssuerIcon(documentType)}
            size={24}
            color={THEME.navy}
          />
        </View>
      )}
    </View>
  )
}
