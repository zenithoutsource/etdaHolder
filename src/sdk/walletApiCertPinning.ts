import { Platform } from 'react-native'

type FetchFn = typeof fetch
type FetchInput = Parameters<FetchFn>[0]
type FetchInit = Parameters<FetchFn>[1]

type PinnedFetchModule = {
  fetch: (
    url: string,
    options: {
      method?: 'DELETE' | 'GET' | 'POST' | 'PUT'
      headers?: Record<string, string>
      body?: string
      pkPinning?: boolean
      sslPinning: { certs: string[] }
    },
  ) => Promise<{
    status: number
    headers: Record<string, string>
    bodyString?: string
    text: () => Promise<string>
  }>
}

const PUBLIC_KEY_PIN_PREFIX = 'sha256/'

export function isPublicKeyPin(pin: string): boolean {
  return pin.startsWith(PUBLIC_KEY_PIN_PREFIX)
}

export function isLegacyCertificateResourcePin(pin: string): boolean {
  return pin.length > 0 && !isPublicKeyPin(pin)
}

export function usesPublicKeyPinning(pins: string[]): boolean {
  return pins.length > 0 && pins.every(isPublicKeyPin)
}

function normalizePinValue(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  if (trimmed.startsWith(PUBLIC_KEY_PIN_PREFIX)) return trimmed
  // Accept bare base64 SPKI hashes from env and normalize to OkHttp pin format.
  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) return `${PUBLIC_KEY_PIN_PREFIX}${trimmed}`
  return trimmed
}

export function getPinnedCertificateNames(): string[] {
  const raw = process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS ?? ''
  return raw
    .split(',')
    .map((name) => normalizePinValue(name))
    .filter((name) => name.length > 0)
}

export type WalletApiPinningConfig = {
  backendBaseUrl: string
  pinnedCertificates: string[]
  usesPublicKeyPinning: boolean
}

export function readWalletApiPinningConfig(backendBaseUrl: string): WalletApiPinningConfig {
  const pinnedCertificates = getPinnedCertificateNames()
  return {
    backendBaseUrl,
    pinnedCertificates,
    usesPublicKeyPinning: usesPublicKeyPinning(pinnedCertificates),
  }
}

function matchesPinnedHost(input: FetchInput, backendHost: string): input is string {
  if (typeof input !== 'string' || backendHost.length === 0) return false
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && url.hostname === backendHost
  } catch {
    return false
  }
}

type PinnedHttpResult = Awaited<ReturnType<PinnedFetchModule['fetch']>>

async function toStandardResponse(pinned: PinnedHttpResult): Promise<Response> {
  const body = pinned.bodyString ?? (await pinned.text())
  return new Response(body, {
    status: pinned.status,
    headers: new Headers(pinned.headers),
  })
}

/**
 * react-native-ssl-pinning rejects on HTTP 4xx/5xx with the response payload
 * (plain object or Error + status/bodyString) instead of returning it.
 * Treat those as fetch Responses so callers can handle expected API errors.
 */
function readPinnedHttpError(error: unknown): PinnedHttpResult | null {
  if (!error || typeof error !== 'object') return null

  const status = 'status' in error ? error.status : undefined
  if (typeof status !== 'number' || status < 400 || status > 599) return null

  const rawHeaders = 'headers' in error ? error.headers : undefined
  const headers =
    rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, string>)
      : {}

  const bodyString =
    'bodyString' in error && typeof error.bodyString === 'string' ? error.bodyString : undefined
  const text =
    'text' in error && typeof error.text === 'function'
      ? (error.text as () => Promise<string>)
      : async () => bodyString ?? ''

  return { status, headers, bodyString, text }
}

function readMethod(init?: FetchInit): 'DELETE' | 'GET' | 'POST' | 'PUT' {
  const method = (init?.method ?? 'GET').toUpperCase()
  return method === 'DELETE' || method === 'POST' || method === 'PUT' ? method : 'GET'
}

function readHeaders(init?: FetchInit): Record<string, string> | undefined {
  if (!init?.headers) return undefined
  return Object.fromEntries(new Headers(init.headers).entries())
}

function readBody(init: FetchInit | undefined, method: 'DELETE' | 'GET' | 'POST' | 'PUT'): string | undefined {
  if (typeof init?.body === 'string') return init.body
  // OkHttp (react-native-ssl-pinning) throws IllegalArgumentException when POST/PUT
  // have a null body — e.g. generated logoutUser() after PIN reset.
  if (method === 'POST' || method === 'PUT') return ''
  return undefined
}

function loadPinnedFetchModule(): PinnedFetchModule {
  // Lazy require keeps web bundles from evaluating the native module unless pinning runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-ssl-pinning') as PinnedFetchModule
}

/**
 * Wraps the configured backend fetch so that HTTPS requests to the backend host
 * — and only that host — are validated against pinned public keys or certificates
 * (ADR 0005: backend host only; Issuer hosts are arbitrary per OID4VCI offer and
 * cannot be pre-pinned without breaking issuance).
 *
 * Public-key pins use `sha256/<base64>` values in `EXPO_PUBLIC_WALLET_API_PINNED_CERTS`
 * with `pkPinning: true` (no bundled `.cer` assets required). Bare base64 hashes
 * without the `sha256/` prefix are normalized before pinning.
 *
 * Falls through to `fallbackFetch` for any other target: non-backend hosts
 * (Issuer calls), non-HTTPS targets (plain-HTTP local/LAN dev backend), web
 * builds (native pinning module unavailable), or when no pinned certificates
 * are configured for this build.
 */
export function createPinnedFetch(fallbackFetch: FetchFn, backendBaseUrl: string): FetchFn {
  const pinnedCertificateNames = getPinnedCertificateNames()
  const backendHost = (() => {
    try {
      return new URL(backendBaseUrl).hostname
    } catch {
      return ''
    }
  })()

  return (async (input: FetchInput, init?: FetchInit) => {
    if (Platform.OS === 'web' || pinnedCertificateNames.length === 0 || !matchesPinnedHost(input, backendHost)) {
      return fallbackFetch(input, init)
    }

    const { fetch: pinnedFetch } = loadPinnedFetchModule()

    try {
      const method = readMethod(init)
      const pinnedResponse = await pinnedFetch(input, {
        method,
        headers: readHeaders(init),
        body: readBody(init, method),
        pkPinning: true,
        sslPinning: { certs: pinnedCertificateNames },
      })

      return toStandardResponse(pinnedResponse)
    } catch (error) {
      const httpError = readPinnedHttpError(error)
      if (httpError) return toStandardResponse(httpError)
      throw error
    }
  }) as FetchFn
}
