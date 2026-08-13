import {
  DID_WEB_FETCH_TIMEOUT_MS,
  DID_WEB_MAX_BYTES,
} from '@/src/config/didWebFetchPolicy'
import { readString } from '@/src/utils/jwtUtils'
import { logWalletStep } from '../debug/walletLogger'
import { didKeyToEd25519PublicJwk, type Ed25519PublicJwk } from './didKeyPublicJwk'

type IssuerResolveDidResponse = {
  success?: boolean
  data?: string
}

function normalizeIssuerUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function readIssuerResolveBaseUrls(
  jwtIss: string,
  issuerBaseUrl?: string,
  issuerMetadata?: Record<string, unknown>,
): string[] {
  const urls = new Set<string>()

  const add = (value?: string) => {
    if (!value) return
    urls.add(normalizeIssuerUrl(value))
  }

  add(issuerBaseUrl)

  const tokenEndpoint = readString(issuerMetadata?.token_endpoint)
  if (tokenEndpoint) {
    try {
      add(new URL(tokenEndpoint).origin)
    } catch {
      // ignore malformed token_endpoint
    }
  }

  const credentialEndpoint = readString(issuerMetadata?.credential_endpoint)
  if (credentialEndpoint) {
    try {
      add(new URL(credentialEndpoint).origin)
    } catch {
      // ignore malformed credential_endpoint
    }
  }

  add(jwtIss)

  // Prefer HTTPS origins so resolveDID never tries cleartext first when both exist.
  return [...urls].sort((left, right) => {
    const leftRank = left.startsWith('https:') ? 0 : 1
    const rightRank = right.startsWith('https:') ? 0 : 1
    return leftRank - rightRank
  })
}

async function resolveDidKeyViaIssuerOnce(
  issuerUrl: string,
  didKey: string,
  fetchImpl: typeof fetch,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Ed25519PublicJwk> {
  const base = normalizeIssuerUrl(issuerUrl)
  const did = didKey.startsWith('did:key:') ? didKey.split('#')[0]! : `did:key:${didKey.split('#')[0]!}`
  const url = `${base}/resolveDID?didKey=${encodeURIComponent(did)}`
  const timeoutMs = options.timeoutMs ?? DID_WEB_FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DID_WEB_MAX_BYTES
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  let bodyBytes: ArrayBuffer
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`ResolveDidFailed:${response.status}`)
    }

    bodyBytes = await response.arrayBuffer()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ResolveDidFailed:')) {
      throw error
    }
    if (isAbortError(error)) {
      throw new Error('ResolveDidFailed: fetch timed out')
    }
    throw new Error(`ResolveDidFailed: network error: ${readErrorMessage(error)}`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (bodyBytes.byteLength > maxBytes) {
    throw new Error('ResolveDidFailed: response exceeds max bytes')
  }

  let body: IssuerResolveDidResponse
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes)) as IssuerResolveDidResponse
  } catch {
    throw new Error('ResolveDidInvalidResponse')
  }

  if (!body.success || typeof body.data !== 'string' || body.data.trim().length === 0) {
    throw new Error('ResolveDidInvalidResponse')
  }

  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: body.data,
  }
}

export async function resolveDidKeyPublicJwk(
  didKey: string,
  options: {
    issuerUrls?: string[]
    fetchImpl?: typeof fetch
    allowLocalFallback?: boolean
    timeoutMs?: number
    maxBytes?: number
  } = {},
): Promise<Ed25519PublicJwk> {
  const fetchImpl = options.fetchImpl ?? fetch
  const issuerUrls = options.issuerUrls ?? []
  const allowLocalFallback = options.allowLocalFallback ?? true
  let lastError: Error | undefined

  for (const issuerUrl of issuerUrls) {
    try {
      return await resolveDidKeyViaIssuerOnce(issuerUrl, didKey, fetchImpl, options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (allowLocalFallback && didKey.startsWith('did:key:')) {
    try {
      const jwk = didKeyToEd25519PublicJwk(didKey)
      logWalletStep('oid4vci', 'issuer-resolve-did-local-fallback', {
        issuerUrlCount: issuerUrls.length,
        lastError: lastError?.message,
      })
      return jwk
    } catch (localError) {
      throw new Error(
        `ResolveDidFailed: local did:key decode failed: ${readErrorMessage(localError)}`,
      )
    }
  }

  throw lastError ?? new Error('ResolveDidFailed: issuer URL missing')
}

function isP256PublicJwk(value: unknown): value is { kty: 'EC'; crv: 'P-256'; x: string; y: string } {
  if (!value || typeof value !== 'object') return false
  const jwk = value as Record<string, unknown>
  return (
    jwk.kty === 'EC' &&
    jwk.crv === 'P-256' &&
    typeof jwk.x === 'string' &&
    jwk.x.length > 0 &&
    typeof jwk.y === 'string' &&
    jwk.y.length > 0
  )
}

function readP256JwkFromResolveBody(body: IssuerResolveDidResponse & { jwk?: unknown }): {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
} {
  if (isP256PublicJwk(body.jwk)) {
    return { kty: 'EC', crv: 'P-256', x: body.jwk.x, y: body.jwk.y }
  }
  if (typeof body.data === 'string' && body.data.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body.data) as unknown
      if (isP256PublicJwk(parsed)) {
        return { kty: 'EC', crv: 'P-256', x: parsed.x, y: parsed.y }
      }
    } catch {
      throw new Error('ResolveDidInvalidResponse')
    }
  }
  throw new Error('ResolveDidInvalidResponse')
}

export async function resolveDidKeyP256PublicJwk(
  didKey: string,
  options: {
    issuerUrls?: string[]
    fetchImpl?: typeof fetch
    timeoutMs?: number
    maxBytes?: number
  } = {},
): Promise<{ kty: 'EC'; crv: 'P-256'; x: string; y: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const issuerUrls = options.issuerUrls ?? []
  let lastError: Error | undefined

  for (const issuerUrl of issuerUrls) {
    try {
      return await resolveDidKeyP256ViaIssuerOnce(issuerUrl, didKey, fetchImpl, options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error('ResolveDidFailed: issuer URL missing')
}

async function resolveDidKeyP256ViaIssuerOnce(
  issuerUrl: string,
  didKey: string,
  fetchImpl: typeof fetch,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ kty: 'EC'; crv: 'P-256'; x: string; y: string }> {
  const base = normalizeIssuerUrl(issuerUrl)
  const did = didKey.startsWith('did:key:') ? didKey.split('#')[0]! : `did:key:${didKey.split('#')[0]!}`
  const url = `${base}/resolveDID?didKey=${encodeURIComponent(did)}`
  const timeoutMs = options.timeoutMs ?? DID_WEB_FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DID_WEB_MAX_BYTES
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  let bodyBytes: ArrayBuffer
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`ResolveDidFailed:${response.status}`)
    }
    bodyBytes = await response.arrayBuffer()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ResolveDidFailed:')) {
      throw error
    }
    if (isAbortError(error)) {
      throw new Error('ResolveDidFailed: fetch timed out')
    }
    throw new Error(`ResolveDidFailed: network error: ${readErrorMessage(error)}`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (bodyBytes.byteLength > maxBytes) {
    throw new Error('ResolveDidFailed: response exceeds max bytes')
  }

  let body: IssuerResolveDidResponse & { jwk?: unknown }
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes)) as IssuerResolveDidResponse & { jwk?: unknown }
  } catch {
    throw new Error('ResolveDidInvalidResponse')
  }

  if (!body.success) {
    throw new Error('ResolveDidInvalidResponse')
  }

  return readP256JwkFromResolveBody(body)
}

export async function resolveDidKeyViaIssuer(
  issuerUrl: string,
  didKey: string,
  fetchImpl: typeof fetch = fetch,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Ed25519PublicJwk> {
  return resolveDidKeyPublicJwk(didKey, {
    issuerUrls: [issuerUrl],
    fetchImpl,
    allowLocalFallback: false,
    ...options,
  })
}

export type { Ed25519PublicJwk }
