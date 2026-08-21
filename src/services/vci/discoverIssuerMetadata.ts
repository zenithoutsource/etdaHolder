import { isRecord, readString, toErrorMessage } from '@/src/utils/jwtUtils'

import type { IssuerMetadataV1_0_15 } from './walletVciTypes'

export function normalizeIssuerIdentifier(issuer: string): string {
  return issuer.replace(/\/$/, '')
}

export function listIssuerIdentifierCandidates(issuer: string): string[] {
  let parsed: URL
  try {
    parsed = new URL(issuer)
  } catch {
    return [normalizeIssuerIdentifier(issuer)]
  }

  const origin = parsed.origin
  const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').filter((segment) => segment.length > 0)
  const candidates: string[] = []
  for (let length = segments.length; length >= 0; length -= 1) {
    const path = segments.slice(0, length).join('/')
    candidates.push(path ? `${origin}/${path}` : origin)
  }
  return candidates
}

export function listIssuerMetadataWellKnownUrls(issuer: string): string[] {
  let parsed: URL
  try {
    parsed = new URL(issuer)
  } catch {
    throw new Error(`InvalidCredentialIssuerUrl: ${issuer}`)
  }

  const path = parsed.pathname.replace(/^\/+|\/+$/g, '')
  const rfc8414 = path
    ? `${parsed.origin}/.well-known/openid-credential-issuer/${path}`
    : `${parsed.origin}/.well-known/openid-credential-issuer`
  const suffix = `${normalizeIssuerIdentifier(issuer)}/.well-known/openid-credential-issuer`
  return rfc8414 === suffix ? [rfc8414] : [rfc8414, suffix]
}

export function issuerIdentifiersCompatible(offerIssuer: string, metadataIssuer: string): boolean {
  const offer = normalizeIssuerIdentifier(offerIssuer)
  const metadata = normalizeIssuerIdentifier(metadataIssuer)
  if (offer === metadata) return true

  let offerUrl: URL
  let metadataUrl: URL
  try {
    offerUrl = new URL(offer)
    metadataUrl = new URL(metadata)
  } catch {
    return false
  }

  if (offerUrl.protocol !== metadataUrl.protocol) return false
  if (offerUrl.host !== metadataUrl.host) return false

  const offerPath = offerUrl.pathname.replace(/\/+$/, '') || '/'
  const metadataPath = metadataUrl.pathname.replace(/\/+$/, '') || '/'
  if (metadataPath === '/') return true
  return offerPath === metadataPath || offerPath.startsWith(`${metadataPath}/`)
}

function isRetryableMetadataStatus(status: number): boolean {
  return status === 404 || status === 405 || status === 406 || status === 410
}

async function fetchJsonObject(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; payload?: Record<string, unknown> }> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json, */*',
    },
  })
  if (!response.ok) {
    return { status: response.status }
  }
  try {
    const payload = (await response.json()) as unknown
    return isRecord(payload) ? { status: response.status, payload } : { status: response.status }
  } catch {
    return { status: response.status }
  }
}

export async function discoverIssuerMetadata(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IssuerMetadataV1_0_15> {
  const identifiers = listIssuerIdentifierCandidates(issuer)
  let lastHttpStatus: number | undefined
  let lastError: unknown
  let sawIncompatibleMetadata = false

  for (const identifier of identifiers) {
    for (const metadataUrl of listIssuerMetadataWellKnownUrls(identifier)) {
      try {
        const result = await fetchJsonObject(metadataUrl, fetchImpl)
        if (!result.payload) {
          lastHttpStatus = result.status
          if (isRetryableMetadataStatus(result.status) || result.status >= 500) continue
          throw new Error(`IssuerMetadataFetchFailed: HTTP ${result.status}`)
        }
        const credentialIssuer = readString(result.payload.credential_issuer)
        if (!credentialIssuer || !issuerIdentifiersCompatible(issuer, credentialIssuer)) {
          sawIncompatibleMetadata = true
          continue
        }
        return result.payload as IssuerMetadataV1_0_15
      } catch (error) {
        lastError = error
        const message = toErrorMessage(error)
        if (message.startsWith('IssuerMetadataFetchFailed: HTTP')) {
          throw error
        }
      }
    }
  }

  if (lastError && toErrorMessage(lastError).startsWith('IssuerMetadataFetchFailed:')) {
    throw lastError
  }
  if (sawIncompatibleMetadata) {
    throw new Error('IssuerMetadataMismatch: credential_issuer does not match the credential offer issuer')
  }
  if (lastHttpStatus !== undefined) {
    throw new Error(`IssuerMetadataFetchFailed: HTTP ${lastHttpStatus}`)
  }
  throw new Error(`IssuerMetadataFetchFailed: ${toErrorMessage(lastError)}`)
}

export function mapIssuerMetadataClientError(error: unknown): Error {
  const message = toErrorMessage(error)
  if (message.startsWith('IssuerMetadata')) return error instanceof Error ? error : new Error(message)
  if (/does not match/i.test(message) || /Validation of metadata/i.test(message)) {
    return new Error(`IssuerMetadataMismatch: ${message}`)
  }
  if (/HTTP\s+\d{3}/i.test(message) || /unsuccessful response/i.test(message)) {
    return new Error(`IssuerMetadataFetchFailed: ${message}`)
  }
  return new Error(`IssuerMetadataFetchFailed: ${message}`)
}
