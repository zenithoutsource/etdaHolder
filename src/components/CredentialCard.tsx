import { Text, View } from 'react-native'

import { getCardSchema } from '../config/cardSchemas'
import type { DisplayField } from '../config/cardSchemas'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = {
  record: VerifiableCredentialRecord
}

function readDisplayValue(claims: Record<string, unknown>, field: DisplayField): unknown {
  for (const key of [field.key, ...(field.aliases ?? [])]) {
    const value = claims[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

export function CredentialCard({ record }: Props) {
  const schema = getCardSchema(record.type)

  return (
    <View
      testID="credential-card"
      accessibilityRole="none"
      style={{ backgroundColor: schema.primaryColor, borderRadius: 16, padding: 20 }}>
      <Text testID="credential-card-title" style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>
        {schema.title}
      </Text>
      <Text testID="credential-card-issuer" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
        {schema.issuerName}
      </Text>
      {schema.displayFields.map((field) => {
        const value = readDisplayValue(record.claims, field)
        if (value === undefined || value === null) return null
        return (
          <View key={field.key} testID={`credential-field-${field.key}`} style={{ marginTop: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{field.label}</Text>
            <Text style={{ color: '#fff', fontSize: 14, marginTop: 2 }}>{String(value)}</Text>
          </View>
        )
      })}
    </View>
  )
}
