type CborMap = Map<unknown, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function decodeCborMap(value: unknown): CborMap | undefined {
  if (isMap(value)) return value
  if (isRecord(value)) {
    return new Map(Object.entries(value))
  }
  return undefined
}

export type ParsedMdocNamespaces = Record<string, Record<string, string | number | boolean>>

export type ParsedMdocDocument = {
  docType: string
  namespaces: ParsedMdocNamespaces
}

function readIssuerSignedItemValue(item: unknown): { namespace: string; identifier: string; value: string | number | boolean } | undefined {
  const map = decodeCborMap(item)
  if (!map) return undefined

  const namespace = readString(map.get('namespace'))
  const identifier = readString(map.get('elementIdentifier'))
  const value = map.get('elementValue')

  if (!namespace || !identifier) return undefined
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined
  }

  return { namespace, identifier, value }
}

function readIssuerSignedNamespaces(nameSpaces: unknown): ParsedMdocNamespaces {
  const namespaces: ParsedMdocNamespaces = {}
  const map = decodeCborMap(nameSpaces)
  if (!map) return namespaces

  for (const [namespaceKey, items] of map.entries()) {
    const namespace = readString(namespaceKey)
    if (!namespace || !Array.isArray(items)) continue

    const claims: Record<string, string | number | boolean> = {}
    for (const item of items) {
      const tagged = item as { value?: unknown }
      const decoded = readIssuerSignedItemValue(tagged?.value ?? item)
      if (!decoded) continue
      claims[decoded.identifier] = decoded.value
    }

    if (Object.keys(claims).length > 0) {
      namespaces[namespace] = claims
    }
  }

  return namespaces
}

export function parseMdocDocument(mdocBytes: Uint8Array, decode: (input: Uint8Array) => unknown): ParsedMdocDocument {
  const decoded = decode(mdocBytes)
  const root = decodeCborMap(decoded)
  if (!root) {
    throw new Error('MdocParseFailed: root document is not a CBOR map')
  }

  const docType = readString(root.get('docType'))
  if (!docType) {
    throw new Error('MdocParseFailed: docType is missing')
  }

  const issuerSigned = decodeCborMap(root.get('issuerSigned'))
  const nameSpaces = issuerSigned?.get('nameSpaces')
  const namespaces = readIssuerSignedNamespaces(nameSpaces)

  return { docType, namespaces }
}

export function listMdocFieldKeys(namespaces: ParsedMdocNamespaces): string[] {
  const keys: string[] = []
  for (const [namespace, claims] of Object.entries(namespaces)) {
    for (const claimKey of Object.keys(claims)) {
      keys.push(`${namespace}.${claimKey}`)
    }
  }
  return keys
}

export function formatMdocFieldLabel(fieldKey: string): string {
  const claimKey = fieldKey.includes('.') ? fieldKey.split('.').pop() ?? fieldKey : fieldKey
  return claimKey
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
