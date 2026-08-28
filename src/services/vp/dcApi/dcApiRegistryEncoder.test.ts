import { encodeDcApiRegistryPayloadBase64 } from './dcApiRegistryEncoder'
import type { DcApiRegistryCredential } from './nativeDcApiProviderModule'

const entry: DcApiRegistryCredential = {
  credentialId: 'mdl-1',
  docType: 'org.iso.18013.5.1.mDL',
  displayName: 'Driving Licence',
  fields: [
    {
      namespace: 'org.iso.18013.5.1',
      identifier: 'family_name',
      fieldValue: 'Lovelace',
    },
    {
      namespace: 'org.iso.18013.5.1',
      identifier: 'given_name',
      fieldValue: 'Ada',
    },
    {
      namespace: 'org.iso.18013.5.1',
      identifier: 'age_over_21',
      fieldValue: true,
    },
  ],
}

describe('dcApiRegistryEncoder', () => {
  test('encodeDcApiRegistryPayloadBase64 builds CMWallet matcher payload with claim values', () => {
    const payloadBase64 = encodeDcApiRegistryPayloadBase64([entry])
    const payloadBytes = Uint8Array.from(atob(payloadBase64), (char) => char.charCodeAt(0))
    const jsonOffset = new DataView(payloadBytes.buffer).getInt32(0, true)
    const jsonText = new TextDecoder().decode(payloadBytes.slice(jsonOffset))

    expect(JSON.parse(jsonText)).toEqual({
      credentials: {
        mso_mdoc: {
          'org.iso.18013.5.1.mDL': [
            {
              id: 'mdl-1',
              title: 'Driving Licence',
              subtitle: 'org.iso.18013.5.1.mDL',
              icon: null,
              paths: {
                'org.iso.18013.5.1': {
                  family_name: { value: 'Lovelace', display: 'Family Name' },
                  given_name: { value: 'Ada', display: 'Given Name' },
                  age_over_21: { value: true, display: 'Age Over 21' },
                },
              },
            },
          ],
        },
      },
    })
  })

  test('encodeDcApiRegistryPayloadBase64 registers portrait as a display-only matcher path', () => {
    const payloadBase64 = encodeDcApiRegistryPayloadBase64([
      {
        ...entry,
        fields: [
          ...entry.fields,
          {
            namespace: 'org.iso.18013.5.1',
            identifier: 'portrait',
            fieldValue: null,
          },
        ],
      },
    ])
    const payloadBytes = Uint8Array.from(atob(payloadBase64), (char) => char.charCodeAt(0))
    const jsonOffset = new DataView(payloadBytes.buffer).getInt32(0, true)
    const jsonText = new TextDecoder().decode(payloadBytes.slice(jsonOffset))
    const parsed = JSON.parse(jsonText) as {
      credentials: { mso_mdoc: Record<string, Array<{ paths: Record<string, Record<string, unknown>> }>> }
    }

    expect(parsed.credentials.mso_mdoc['org.iso.18013.5.1.mDL']?.[0]?.paths['org.iso.18013.5.1']?.portrait).toEqual({
      display: 'Portrait',
    })
  })
})
