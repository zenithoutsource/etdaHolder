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

export type MdocNamespaceValue = string | number | boolean | unknown

export type ParsedMdocNamespaces = Record<string, Record<string, MdocNamespaceValue>>

export type ParsedMdocDocument = {
  docType: string
  namespaces: ParsedMdocNamespaces
}

function readTagNumber(item: unknown): number | undefined {
  if (isMap(item)) {
    const tag = item.get('tag')
    return typeof tag === 'number' ? tag : undefined
  }
  if (typeof item === 'object' && item !== null && 'tag' in item) {
    const tag = (item as { tag?: unknown }).tag
    return typeof tag === 'number' ? tag : undefined
  }
  return undefined
}

function readTagValue(item: unknown): unknown {
  if (isMap(item)) return item.get('value')
  if (typeof item === 'object' && item !== null && 'value' in item) {
    return (item as { value?: unknown }).value
  }
  return undefined
}

function unwrapTaggedItem(item: unknown, decode: (input: Uint8Array) => unknown): unknown {
  let current = item
  for (let depth = 0; depth < 3; depth += 1) {
    if (current instanceof Uint8Array) {
      current = decode(current)
      continue
    }
    const tag = readTagNumber(current)
    const value = readTagValue(current)
    if (tag === 24 && value instanceof Uint8Array) {
      current = decode(value)
      continue
    }
    break
  }
  return current
}

function readIssuerSignedItemValue(
  item: unknown,
  namespaceFromKey: string,
  decode: (input: Uint8Array) => unknown,
): { namespace: string; identifier: string; value: unknown } | undefined {
  const unwrapped = unwrapTaggedItem(item, decode)
  const map = decodeCborMap(unwrapped)
  if (!map) return undefined

  const namespace = readString(map.get('namespace')) ?? namespaceFromKey
  const identifier = readString(map.get('elementIdentifier'))
  if (!identifier) return undefined

  const value = map.get('elementValue')
  if (value === undefined) return undefined

  return { namespace, identifier, value }
}

function readIssuerSignedNamespaces(
  nameSpaces: unknown,
  decode: (input: Uint8Array) => unknown,
): ParsedMdocNamespaces {
  const namespaces: ParsedMdocNamespaces = {}
  const map = decodeCborMap(nameSpaces)
  if (!map) return namespaces

  for (const [namespaceKey, items] of map.entries()) {
    const namespace = readString(namespaceKey)
    if (!namespace || !Array.isArray(items)) continue

    const claims: Record<string, MdocNamespaceValue> = {}
    for (const item of items) {
      const decoded = readIssuerSignedItemValue(item, namespace, decode)
      if (!decoded) continue
      claims[decoded.identifier] = decoded.value
    }

    if (Object.keys(claims).length > 0) {
      namespaces[namespace] = claims
    }
  }

  return namespaces
}

function readIssuerSignedNameSpaces(root: CborMap): unknown {
  const documents = root.get('documents')
  if (Array.isArray(documents) && documents[0]) {
    const firstDocument = decodeCborMap(documents[0])
    if (firstDocument) {
      const nestedIssuerSigned = decodeCborMap(firstDocument.get('issuerSigned'))
      return nestedIssuerSigned?.get('nameSpaces') ?? firstDocument.get('nameSpaces')
    }
  }

  const issuerSigned = decodeCborMap(root.get('issuerSigned'))
  if (issuerSigned) {
    return issuerSigned.get('nameSpaces')
  }

  return root.get('nameSpaces')
}

function readDocType(root: CborMap): string | undefined {
  const direct = readString(root.get('docType'))
  if (direct) return direct

  const documents = root.get('documents')
  if (Array.isArray(documents) && documents[0]) {
    const firstDocument = decodeCborMap(documents[0])
    const nested = readString(firstDocument?.get('docType'))
    if (nested) return nested
  }

  return undefined
}

function inferDocType(docType: string | undefined, namespaces: ParsedMdocNamespaces): string {
  if (docType) return docType
  if (namespaces['org.iso.18013.5.1']) return 'org.iso.18013.5.1.mDL'
  throw new Error('MdocParseFailed: docType is missing')
}

export function parseMdocDocument(
  mdocBytes: Uint8Array,
  decode: (input: Uint8Array) => unknown,
): ParsedMdocDocument {
  const decoded = decode(mdocBytes)
  const root = decodeCborMap(decoded)
  if (!root) {
    throw new Error('MdocParseFailed: root document is not a CBOR map')
  }

  const namespaces = readIssuerSignedNamespaces(readIssuerSignedNameSpaces(root), decode)
  const docType = inferDocType(readDocType(root), namespaces)

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
