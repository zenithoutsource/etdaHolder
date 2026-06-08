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
      sslPinning: { certs: string[] }
    },
  ) => Promise<{
    status: number
    headers: Record<string, string>
    bodyString?: string
    text: () => Promise<string>
  }>
}

export function getPinnedCertificateNames(): string[] {
  const raw = process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS ?? ''
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

export type WalletApiPinningConfig = {
  backendBaseUrl: string
  pinnedCertificates: string[]
}

export function readWalletApiPinningConfig(backendBaseUrl: string): WalletApiPinningConfig {
  return {
    backendBaseUrl,
    pinnedCertificates: getPinnedCertificateNames(),
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

async function toStandardResponse(pinned: Awaited<ReturnType<PinnedFetchModule['fetch']>>): Promise<Response> {
  const body = pinned.bodyString ?? (await pinned.text())
  return new Response(body, {
    status: pinned.status,
    headers: new Headers(pinned.headers),
  })
}

function readMethod(init?: FetchInit): 'DELETE' | 'GET' | 'POST' | 'PUT' {
  const method = (init?.method ?? 'GET').toUpperCase()
  return method === 'DELETE' || method === 'POST' || method === 'PUT' ? method : 'GET'
}

function readHeaders(init?: FetchInit): Record<string, string> | undefined {
  if (!init?.headers) return undefined
  return Object.fromEntries(new Headers(init.headers).entries())
}

function readBody(init?: FetchInit): string | undefined {
  if (typeof init?.body === 'string') return init.body
  return undefined
}

/**
 * Wraps the configured backend fetch so that HTTPS requests to the backend host
 * — and only that host — are validated against pinned certificates (ADR 0005:
 * backend host only; Issuer hosts are arbitrary per OID4VCI offer and cannot be
 * pre-pinned without breaking issuance).
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

    const { fetch: pinnedFetch }: PinnedFetchModule = await import('react-native-ssl-pinning')

    const pinnedResponse = await pinnedFetch(input, {
      method: readMethod(init),
      headers: readHeaders(init),
      body: readBody(init),
      sslPinning: { certs: pinnedCertificateNames },
    })

    return toStandardResponse(pinnedResponse)
  }) as FetchFn
}
