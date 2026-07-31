import {
  DID_WEB_FETCH_TIMEOUT_MS,
  DID_WEB_MAX_BYTES,
} from '@/src/config/didWebFetchPolicy'

export type Ed25519PublicJwk = {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}

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

export async function resolveDidKeyViaIssuer(
  issuerUrl: string,
  didKey: string,
  fetchImpl: typeof fetch = fetch,
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
    throw new Error('ResolveDidFailed: network error')
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
