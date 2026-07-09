import { isRecord, readRecord, readString } from '@/src/utils/jwtUtils'

export type VerificationJwk = Record<string, unknown>

export function readDidWebDocumentUrl(did: string): string {
  if (!did.startsWith('did:web:')) {
    throw new Error('DidWebInvalid: DID must use did:web method')
  }

  const methodSpecificId = did.slice('did:web:'.length)
  if (!methodSpecificId) {
    throw new Error('DidWebInvalid: did:web method-specific id is required')
  }

  const segments = methodSpecificId.split(':').map((segment) => decodeURIComponent(segment))
  const host = segments[0]
  if (!host) {
    throw new Error('DidWebInvalid: did:web host is required')
  }

  if (segments.length === 1) {
    return `https://${host}/.well-known/did.json`
  }

  const path = segments.slice(1).join('/')
  return `https://${host}/${path}/did.json`
}

export async function resolveDidWebVerificationJwk(
  did: string,
  kid: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<VerificationJwk> {
  const documentUrl = readDidWebDocumentUrl(did)
  const response = await fetchImpl(documentUrl, {
    headers: { Accept: 'application/did+json, application/json' },
  })

  if (!response.ok) {
    throw new Error(`DidWebResolveFailed: HTTP ${response.status}`)
  }

  const document = (await response.json()) as unknown
  if (!isRecord(document)) {
    throw new Error('DidWebResolveFailed: DID document must be a JSON object')
  }

  const verificationMethod = readVerificationMethod(document, kid)
  if (!verificationMethod) {
    throw new Error('DidWebResolveFailed: verification method not found')
  }

  const publicKeyJwk = readRecord(verificationMethod.publicKeyJwk)
  if (!publicKeyJwk) {
    throw new Error('DidWebResolveFailed: verification method publicKeyJwk is required')
  }

  return publicKeyJwk
}

function readVerificationMethod(
  document: Record<string, unknown>,
  kid: string | undefined,
): Record<string, unknown> | undefined {
  const verificationMethods = Array.isArray(document.verificationMethod)
    ? document.verificationMethod
        .map((entry) => readRecord(entry))
        .filter((method): method is Record<string, unknown> => Boolean(method))
    : []

  const byId = new Map<string, Record<string, unknown>>()
  for (const method of verificationMethods) {
    const id = readString(method.id)
    if (id) byId.set(id, method)
  }

  if (kid) {
    const exact = byId.get(kid)
    if (exact) return exact

    const documentId = readString(document.id)
    if (documentId && kid.startsWith('#')) {
      return byId.get(`${documentId}${kid}`)
    }
  }

  const assertionMethods = Array.isArray(document.assertionMethod) ? document.assertionMethod : []
  for (const entry of assertionMethods) {
    if (typeof entry === 'string') {
      const resolved = byId.get(entry)
      if (resolved) return resolved
      continue
    }

    const method = readRecord(entry)
    if (method) return method
  }

  return verificationMethods[0]
}