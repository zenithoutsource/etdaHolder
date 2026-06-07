import { createPinnedFetch } from './walletApiCertPinning'

type FetchFn = typeof fetch
type FetchInput = Parameters<FetchFn>[0]
type FetchInit = Parameters<FetchFn>[1]

const DEFAULT_WALLET_API_BASE_URL = 'http://localhost:3001'
const WALLET_API_PREFIX = '/wallet-api/'

let originalFetch: FetchFn | null = null

type InstallWalletApiFetchOptions = {
  baseUrl?: string
  fetchImpl?: FetchFn
}

function getConfiguredBaseUrl(): string {
  return process.env.EXPO_PUBLIC_WALLET_API_BASE_URL ?? DEFAULT_WALLET_API_BASE_URL
}

export function normalizeWalletApiBaseUrl(baseUrl = getConfiguredBaseUrl()): string {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export function resolveWalletApiUrl(input: FetchInput, baseUrl = getConfiguredBaseUrl()): FetchInput {
  if (typeof input !== 'string') return input
  if (!input.startsWith(WALLET_API_PREFIX)) return input

  return `${normalizeWalletApiBaseUrl(baseUrl)}${input}`
}

async function normalizeWalletApiResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.toLowerCase().includes('application/json')) {
    return response
  }

  const text = await response.text()
  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json')

  return new Response(
    JSON.stringify({
      message: text || response.statusText || `HTTP ${response.status}`,
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  )
}

export function installWalletApiFetch(options: InstallWalletApiFetchOptions = {}): void {
  const baseUrl = normalizeWalletApiBaseUrl(options.baseUrl)

  if (options.fetchImpl) {
    originalFetch = options.fetchImpl
  } else if (!originalFetch) {
    originalFetch = globalThis.fetch.bind(globalThis)
  }

  const fetchImpl = createPinnedFetch(originalFetch, baseUrl)

  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const resolvedInput = resolveWalletApiUrl(input, baseUrl)
    const response = await fetchImpl(resolvedInput, init)

    return typeof input === 'string' && input.startsWith(WALLET_API_PREFIX)
      ? normalizeWalletApiResponse(response)
      : response
  }) as FetchFn
}
