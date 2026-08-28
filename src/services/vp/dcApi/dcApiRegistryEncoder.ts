/**
 * Encodes wallet mdoc registry metadata for Android Credential Manager WASM matching.
 */
import { formatMdocFieldLabel } from '@/src/services/proximity/mdocParser'

import { isDcApiRegistryMatchField } from './dcApiRegistryFields'
import type { DcApiRegistryCredential } from './nativeDcApiProviderModule'

type EncodedRegistryJson = {
  credentials: {
    mso_mdoc: Record<
      string,
      Array<{
        id: string
        title: string
        subtitle?: string
        icon: null
        paths: Record<
          string,
          Record<
            string,
            {
              value?: string | number | boolean
              display: string
            }
          >
        >
      }>
    >
  }
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function toRegistryMatchValue(
  fieldValue: string | number | boolean | null,
): string | number | boolean | undefined {
  if (fieldValue === null) return undefined
  if (typeof fieldValue === 'string' && fieldValue.startsWith('__b64__:')) {
    return undefined
  }
  return fieldValue
}

export function encodeDcApiRegistryPayloadBase64(entries: DcApiRegistryCredential[]): string {
  const mdocCredentials: EncodedRegistryJson['credentials']['mso_mdoc'] = {}

  for (const entry of entries) {
    const paths: Record<string, Record<string, { value?: string | number | boolean; display: string }>> =
      {}

    for (const field of entry.fields) {
      if (!isDcApiRegistryMatchField(field)) continue
      if (!paths[field.namespace]) {
        paths[field.namespace] = {}
      }
      paths[field.namespace]![field.identifier] = {
        value: toRegistryMatchValue(field.fieldValue),
        display: formatMdocFieldLabel(`${field.namespace}.${field.identifier}`),
      }
    }

    if (!mdocCredentials[entry.docType]) {
      mdocCredentials[entry.docType] = []
    }

    mdocCredentials[entry.docType]!.push({
      id: entry.credentialId,
      title: entry.displayName,
      subtitle: entry.docType,
      icon: null,
      paths,
    })
  }

  const registryJson: EncodedRegistryJson = {
    credentials: {
      mso_mdoc: mdocCredentials,
    },
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(registryJson))
  const payload = new Uint8Array(4 + jsonBytes.length)
  new DataView(payload.buffer).setInt32(0, 4, true)
  payload.set(jsonBytes, 4)
  return encodeBase64Bytes(payload)
}
