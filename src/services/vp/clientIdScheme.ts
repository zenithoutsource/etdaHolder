export const SUPPORTED_CLIENT_ID_SCHEMES = [
  'pre_registered',
  'redirect_uri',
  'decentralized_identifier',
] as const

export type SupportedClientIdScheme = (typeof SUPPORTED_CLIENT_ID_SCHEMES)[number]

export type UnsupportedClientIdScheme =
  | 'openid_federation'
  | 'verifier_attestation'
  | 'x509_san_dns'
  | 'x509_hash'
  | 'origin'
  | 'unknown'

export type ParsedClientId =
  | {
      scheme: SupportedClientIdScheme
      originalClientId: string
      clientId: string
    }
  | {
      scheme: UnsupportedClientIdScheme
      originalClientId: string
      clientId: string
    }

const UNSUPPORTED_PREFIXES = new Set<UnsupportedClientIdScheme>([
  'openid_federation',
  'verifier_attestation',
  'x509_san_dns',
  'x509_hash',
  'origin',
])

export function parseClientId(clientId: string): ParsedClientId {
  const colonIndex = clientId.indexOf(':')
  if (colonIndex === -1) {
    return { scheme: 'pre_registered', originalClientId: clientId, clientId }
  }

  const prefix = clientId.slice(0, colonIndex)
  const originalClientId = clientId.slice(colonIndex + 1)

  if (prefix === 'redirect_uri') {
    return { scheme: 'redirect_uri', originalClientId, clientId }
  }

  if (prefix === 'decentralized_identifier') {
    return { scheme: 'decentralized_identifier', originalClientId, clientId }
  }

  if (UNSUPPORTED_PREFIXES.has(prefix as UnsupportedClientIdScheme)) {
    return { scheme: prefix as UnsupportedClientIdScheme, originalClientId, clientId }
  }

  return { scheme: 'pre_registered', originalClientId: clientId, clientId }
}

export function clientIdRequiresSignedRequestObject(scheme: SupportedClientIdScheme): boolean {
  return scheme === 'decentralized_identifier'
}

export function clientIdAllowsUnsignedRequestObject(scheme: SupportedClientIdScheme): boolean {
  return scheme === 'redirect_uri' || scheme === 'pre_registered'
}

export function readDidWebHttpsOrigin(did: string): string | undefined {
  if (!did.startsWith('did:web:')) return undefined

  const methodSpecificId = did.slice('did:web:'.length)
  if (!methodSpecificId) return undefined

  const host = decodeURIComponent(methodSpecificId.split(':')[0] ?? '')
  if (!host) return undefined

  try {
    return new URL(`https://${host}`).origin
  } catch {
    return undefined
  }
}

export function readResponseUriMatchesClientId(clientId: string, responseUri: string): boolean {
  const parsed = parseClientId(clientId)
  if (parsed.scheme === 'redirect_uri') {
    return parsed.originalClientId === responseUri
  }

  if (parsed.scheme === 'decentralized_identifier' && parsed.originalClientId.startsWith('did:web:')) {
    const expectedOrigin = readDidWebHttpsOrigin(parsed.originalClientId)
    const responseOrigin = readUrlOrigin(responseUri)
    return Boolean(expectedOrigin && responseOrigin && expectedOrigin === responseOrigin)
  }

  return true
}

function readUrlOrigin(raw: string): string | undefined {
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
}
