import { isOid4vpPresentationWireBody } from '../vp/oid4vpRawProtocolLog'
import {
  isWalletDebugLoggingEnabled,
  isWalletRawProtocolLoggingEnabled,
  logWalletError,
  logWalletStep,
  readWalletDebugMaxBodyBytes,
  sanitizeForWalletLog,
} from './walletLogger'

const PROTOCOL_PATH_PATTERN = /\/(credential|token|openid4vc|verify|presentation|deferred)(\/|$)/i
const HTTP_FAILURE_DEDUPE_WINDOW_MS = 3_000

const recentHttpFailureLogs = new Map<string, number>()

/** Clears in-memory HTTP failure dedupe state (tests only). */
export function resetWalletHttpTraceDedupeForTesting(): void {
  recentHttpFailureLogs.clear()
}

export function isSilentIssuerMetadataDiscoveryResponse(
  url: string,
  method: string,
  status: number,
): boolean {
  if (method !== 'GET') return false
  if (status !== 404 && status !== 405 && status !== 406 && status !== 410) return false
  return url.includes('/.well-known/openid-credential-issuer')
}

export function resolveHttpTraceScope(resolvedUrl: string, walletApiHost?: string): string {
  try {
    const parsed = new URL(resolvedUrl, 'http://local.invalid')
    if (parsed.pathname.startsWith('/wallet-api/')) return 'sdk'
    if (walletApiHost && parsed.host === walletApiHost && parsed.pathname.includes('/wallet-api/')) {
      return 'sdk'
    }
  } catch {
    if (resolvedUrl.startsWith('/wallet-api/')) return 'sdk'
  }
  return 'http'
}

export function truncateBodyPreview(text: string, maxBytes = readWalletDebugMaxBodyBytes()): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return text
  const slice = bytes.slice(0, maxBytes)
  return `${new TextDecoder().decode(slice)}…[truncated ${bytes.length - maxBytes} bytes]`
}

export function shouldCaptureSuccessBody(
  url: string,
  init?: RequestInit,
  _response?: Response,
  responseText?: string,
): boolean {
  if (!isWalletRawProtocolLoggingEnabled()) return false
  if (PROTOCOL_PATH_PATTERN.test(url)) return true
  const contentType = init?.headers ? readHeader(init.headers, 'content-type') : undefined
  const body = typeof init?.body === 'string' ? init.body : ''
  if (contentType?.includes('application/x-www-form-urlencoded') && body.includes('vp_token')) return true
  if (responseText) {
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>
      if ('access_token' in parsed || 'c_nonce' in parsed || 'credential' in parsed || 'error' in parsed) {
        return true
      }
    } catch {
      // not json
    }
  }
  return false
}

export async function traceHttpFetch(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { walletApiBaseUrl?: string },
): Promise<Response> {
  if (!isWalletDebugLoggingEnabled()) {
    return fetchImpl(input, init)
  }

  const resolvedUrl = readResolvedUrl(input)
  const walletApiHost = readHostFromBaseUrl(options?.walletApiBaseUrl)
  const scope = resolveHttpTraceScope(resolvedUrl, walletApiHost)
  const method = readRequestMethod(input, init)
  if (method === 'POST' && isOid4vpPresentationWireBody(readRequestBodyString(init))) {
    return fetchImpl(input, init)
  }
  const startedAt = Date.now()

  if (isWalletRawProtocolLoggingEnabled()) {
    logWalletStep(scope, 'http-request-start', {
      method,
      ...describeUrl(resolvedUrl),
      requestHeaders: describeSafeHeaders(init?.headers),
      requestBodyPreview: await readRequestBodyPreview(init),
    })
  }

  try {
    const response = await fetchImpl(input, init)
    const durationMs = Date.now() - startedAt
    const contentType = response.headers.get('Content-Type') ?? undefined
    const responseText = await safeReadResponseText(response)
    const baseDetails = {
      method,
      ...describeUrl(resolvedUrl),
      durationMs,
      status: response.status,
      ok: response.ok,
      contentType,
    }
    const captureBody =
      !response.ok || shouldCaptureSuccessBody(resolvedUrl, init, response, responseText)
    const bodyDetails = captureBody
      ? {
          responseBody: sanitizeForWalletLog(
            tryParseJson(responseText) ?? truncateBodyPreview(responseText),
          ),
        }
      : {}

    if (!response.ok) {
      if (!isSilentIssuerMetadataDiscoveryResponse(resolvedUrl, method, response.status)) {
        const dedupeKey = `${method}|${resolvedUrl}|${response.status}`
        if (shouldEmitHttpFailureLog(dedupeKey)) {
          logWalletError(
            scope,
            'http-response',
            new Error(`HttpRequestFailed:${response.status}`),
            { ...baseDetails, ...bodyDetails },
          )
        }
      }
    } else {
      logWalletStep(scope, 'http-response', { ...baseDetails, ...bodyDetails })
    }

    return response
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const details = { method, ...describeUrl(resolvedUrl), durationMs }
    if (isAbortError(error)) {
      logWalletStep(scope, 'http-request-aborted', details)
    } else {
      logWalletError(scope, 'http-request-failed', error, details)
    }
    throw error
  }
}

function readResolvedUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

function readRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

function describeUrl(raw: string): Record<string, unknown> {
  try {
    const parsed = new URL(raw, 'http://local.invalid')
    return {
      scheme: parsed.protocol.replace(':', ''),
      host: parsed.host || undefined,
      path: parsed.pathname || undefined,
      queryKeys: Array.from(parsed.searchParams.keys()),
      urlBytes: raw.length,
    }
  } catch {
    return { path: raw.startsWith('/') ? raw : undefined, urlBytes: raw.length }
  }
}

function describeSafeHeaders(headers?: HeadersInit): Record<string, unknown> | undefined {
  if (!headers) return undefined

  const output: Record<string, unknown> = {}
  const entries = readHeaderEntries(headers)

  for (const [key, value] of entries) {
    if (/^authorization$/i.test(key)) {
      const scheme = value.split(/\s+/)[0] ?? ''
      output.authorizationPresent = true
      if (scheme) output.authorizationScheme = scheme
      continue
    }
    output[key] = value
  }

  return Object.keys(output).length > 0 ? output : undefined
}

function readHeaderEntries(headers: HeadersInit): Array<[string, string]> {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Array.from(headers.entries())
  }
  if (Array.isArray(headers)) {
    return headers.map(([key, value]) => [key, value])
  }
  return Object.entries(headers as Record<string, string>)
}

function readHeader(headers: HeadersInit, name: string): string | undefined {
  const normalizedName = name.toLowerCase()
  for (const [key, value] of readHeaderEntries(headers)) {
    if (key.toLowerCase() === normalizedName) return value
  }
  return undefined
}

function readRequestBodyString(init?: RequestInit): string | undefined {
  if (!init?.body || typeof init.body !== 'string') return undefined
  return init.body
}

async function readRequestBodyPreview(init?: RequestInit): Promise<unknown> {
  const body = readRequestBodyString(init)
  if (!body) return undefined

  try {
    const parsed = tryParseJson(body)
    const preview = parsed ?? truncateBodyPreview(body)
    return sanitizeForWalletLog(preview)
  } catch {
    return { bodyReadFailed: true }
  }
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    const cloned = response.clone()
    return await cloned.text()
  } catch {
    return ''
  }
}

function tryParseJson(text: string): unknown | undefined {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error && typeof error.name === 'string' ? error.name : ''
  return name === 'AbortError'
}

function readHostFromBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined
  try {
    return new URL(baseUrl).host
  } catch {
    return undefined
  }
}

function shouldEmitHttpFailureLog(dedupeKey: string, now = Date.now()): boolean {
  const lastLoggedAt = recentHttpFailureLogs.get(dedupeKey)
  if (lastLoggedAt !== undefined && now - lastLoggedAt < HTTP_FAILURE_DEDUPE_WINDOW_MS) {
    return false
  }
  recentHttpFailureLogs.set(dedupeKey, now)
  return true
}
