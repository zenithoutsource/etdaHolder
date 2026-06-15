import { getOriginalFetch, setFetchImplementation } from './fetchIndirection'
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
  devIssuerProxy?: DevIssuerProxyConfig | null
  devVerifierProxy?: DevIssuerProxyConfig | null
}

type DevIssuerProxyConfig = {
  target: string
  baseUrl: string
}

export function getConfiguredWalletApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_WALLET_API_BASE_URL ?? DEFAULT_WALLET_API_BASE_URL
}

export function normalizeWalletApiBaseUrl(baseUrl = getConfiguredWalletApiBaseUrl()): string {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export function resolveWalletApiUrl(input: FetchInput, baseUrl = getConfiguredWalletApiBaseUrl()): FetchInput {
  if (typeof input !== 'string') return input
  if (!input.startsWith(WALLET_API_PREFIX)) return input

  return `${normalizeWalletApiBaseUrl(baseUrl)}${input}`
}

export function getConfiguredDevIssuerProxy(): DevIssuerProxyConfig | null {
  const target = process.env.EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET
  const baseUrl = process.env.EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL
  if (!target || !baseUrl) return null

  return normalizeDevIssuerProxyConfig({
    target,
    baseUrl,
  })
}

export function getConfiguredDevVerifierProxy(): DevIssuerProxyConfig | null {
  const target = process.env.EXPO_PUBLIC_DEV_VERIFIER_PROXY_TARGET
    ?? process.env.EXPO_PUBLIC_VERIFIER_API_BASE_URL
  const baseUrl = process.env.EXPO_PUBLIC_DEV_VERIFIER_PROXY_BASE_URL
  if (!target || !baseUrl) return null

  return normalizeDevIssuerProxyConfig({
    target,
    baseUrl,
  })
}

function normalizeDevIssuerProxyConfig(config: DevIssuerProxyConfig): DevIssuerProxyConfig {
  return {
    target: config.target.endsWith('/') ? config.target.slice(0, -1) : config.target,
    baseUrl: config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl,
  }
}

export function resolveDevIssuerProxyUrl(input: FetchInput, proxy = getConfiguredDevIssuerProxy()): FetchInput {
  if (typeof input !== 'string') return input

  if (!proxy) return input
  const normalizedProxy = normalizeDevIssuerProxyConfig(proxy)
  if (!input.startsWith(normalizedProxy.target)) return input

  return `${normalizedProxy.baseUrl}${input.slice(normalizedProxy.target.length)}`
}

function resolveDevProxyUrls(input: FetchInput, proxies: (DevIssuerProxyConfig | null)[]): FetchInput {
  return proxies.reduce<FetchInput>(
    (resolvedInput, proxy) => resolveDevIssuerProxyUrl(resolvedInput, proxy),
    input,
  )
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
    originalFetch = getOriginalFetch()
  }

  const fetchImpl = createPinnedFetch(originalFetch, baseUrl)
  const devIssuerProxy = options.devIssuerProxy === undefined
    ? getConfiguredDevIssuerProxy()
    : options.devIssuerProxy
  const devVerifierProxy = options.devVerifierProxy === undefined
    ? getConfiguredDevVerifierProxy()
    : options.devVerifierProxy

  setFetchImplementation((async (input: FetchInput, init?: FetchInit) => {
    const resolvedInput = resolveDevProxyUrls(resolveWalletApiUrl(input, baseUrl), [devIssuerProxy, devVerifierProxy])
    const response = await fetchImpl(resolvedInput, init)

    return typeof input === 'string' && input.startsWith(WALLET_API_PREFIX)
      ? normalizeWalletApiResponse(response)
      : response
  }) as FetchFn)
}
