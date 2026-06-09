import { Text, View } from 'react-native'

import { readCredentialDetailDisplay } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = {
  record: VerifiableCredentialRecord
}

export function CredentialCard({ record }: Props) {
  const display = readCredentialDetailDisplay(record)

  return (
    <View
      testID="credential-card"
      accessibilityRole="none"
      className="rounded-2xl p-5"
      style={{ backgroundColor: display.primaryColor }}>
      <Text testID="credential-card-title" className="text-lg font-semibold text-white">
        {display.title}
      </Text>
      <Text testID="credential-card-issuer" className="mt-1 text-[13px] text-white/75">
        {display.issuerName}
      </Text>
      {display.primaryRows.map((row) => (
        <View key={row.key} testID={`credential-field-${row.key}`} className="mt-3">
          <Text className="text-[11px] text-white/60">{row.label}</Text>
          <Text className="mt-0.5 text-sm text-white">{row.value}</Text>
        </View>
      ))}
    </View>
  )
}
