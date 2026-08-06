import {
  PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS,
  PRESENTATION_DEFINITION_MAX_BYTES,
} from '@/src/config/presentationDefinitionFetchPolicy'
import { logWalletStep } from '../debug/walletLogger'
import { toErrorMessage } from '@/src/utils/jwtUtils'
import { parsePresentationDefinitionJson, type PresentationDefinition } from './presentationService'

export type FetchPresentationDefinitionOptions = {
  allowedOrigins: string[]
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

export async function fetchPresentationDefinition(
  uri: string,
  options: FetchPresentationDefinitionOptions,
): Promise<PresentationDefinition> {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: presentation_definition_uri is not a valid URL (${toErrorMessage(error)})`)
  }

  assertPresentationDefinitionUriPolicy(parsed)

  if (!options.allowedOrigins.includes(parsed.origin)) {
    throw new Error('PresentationDefinitionUntrusted: URI origin is not allowlisted')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? PRESENTATION_DEFINITION_MAX_BYTES

  logWalletStep('oid4vp', 'fetch-presentation-definition-start', {
    host: parsed.host,
    origin: parsed.origin,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetchImpl(uri, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('PresentationDefinitionFetchFailed: request timed out')
    }
    throw new Error(`PresentationDefinitionFetchFailed: network error (${toErrorMessage(error)})`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new Error(`PresentationDefinitionFetchFailed: HTTP ${response.status}`)
  }

  let text: string
  try {
    text = await readResponseTextWithCap(response, maxBytes)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PresentationDefinitionFetchFailed:')) {
      throw error
    }
    throw new Error(`PresentationDefinitionFetchFailed: network error (${toErrorMessage(error)})`)
  }

  logWalletStep('oid4vp', 'fetch-presentation-definition-complete', {
    host: parsed.host,
    status: response.status,
    bytes: text.length,
  })

  return parsePresentationDefinitionJson(text)
}

function assertPresentationDefinitionUriPolicy(url: URL): void {
  if (url.protocol === 'https:') return
  if (__DEV__ && url.protocol === 'http:') return
  throw new Error('PresentationDefinitionUntrusted: presentation definition URI must use HTTPS')
}

async function readResponseTextWithCap(response: Response, maxBytes: number): Promise<string> {
  const text = await response.text()
  if (text.length > maxBytes) {
    throw new Error('PresentationDefinitionFetchFailed: response exceeds maximum size')
  }
  return text
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
