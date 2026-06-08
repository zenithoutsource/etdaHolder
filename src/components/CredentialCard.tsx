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
      style={{ backgroundColor: display.primaryColor, borderRadius: 16, padding: 20 }}>
      <Text testID="credential-card-title" style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>
        {display.title}
      </Text>
      <Text testID="credential-card-issuer" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
        {display.issuerName}
      </Text>
      {display.primaryRows.map((row) => {
        return (
          <View key={row.key} testID={`credential-field-${row.key}`} style={{ marginTop: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{row.label}</Text>
            <Text style={{ color: '#fff', fontSize: 14, marginTop: 2 }}>{row.value}</Text>
          </View>
        )
      })}
    </View>
  )
}
