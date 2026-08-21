import {
  VERIFIER_JWKS_FETCH_TIMEOUT_MS,
  VERIFIER_JWKS_MAX_BYTES,
  VERIFIER_JWKS_PATH,
} from '@/src/config/verifierJwksPolicy'
import { isRecord, readString } from '@/src/utils/jwtUtils'

export function readVerifierJwksUrl(responseUri: string, jwksPath: string = VERIFIER_JWKS_PATH): string {
  let origin: string
  try {
    origin = new URL(responseUri).origin
  } catch {
    throw new Error('PresentationRequestInvalid: response_uri is not a valid URL')
  }

  const normalizedPath = jwksPath.startsWith('/') ? jwksPath : `/${jwksPath}`
  return `${origin}${normalizedPath}`
}

export async function resolveJwkFromVerifierJwks(input: {
  responseUri: string
  kid?: string
  fetchImpl?: typeof fetch
  jwksPath?: string
  timeoutMs?: number
  maxBytes?: number
}): Promise<Record<string, unknown>> {
  const jwksUrl = readVerifierJwksUrl(input.responseUri, input.jwksPath ?? VERIFIER_JWKS_PATH)
  const timeoutMs = input.timeoutMs ?? VERIFIER_JWKS_FETCH_TIMEOUT_MS
  const maxBytes = input.maxBytes ?? VERIFIER_JWKS_MAX_BYTES
  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  let bodyBytes: ArrayBuffer
  try {
    response = await fetchImpl(jwksUrl, {
      headers: { Accept: 'application/jwk-set+json, application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`PresentationRequestInvalid: verifier JWKS HTTP ${response.status}`)
    }

    bodyBytes = await response.arrayBuffer()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PresentationRequestInvalid:')) {
      throw error
    }
    if (isAbortError(error)) {
      throw new Error('PresentationRequestInvalid: verifier JWKS fetch timed out')
    }
    throw new Error('PresentationRequestInvalid: verifier JWKS network error')
  } finally {
    clearTimeout(timeoutId)
  }

  if (bodyBytes.byteLength > maxBytes) {
    throw new Error('PresentationRequestInvalid: verifier JWKS exceeds max bytes')
  }

  let document: unknown
  try {
    document = JSON.parse(new TextDecoder().decode(bodyBytes)) as unknown
  } catch {
    throw new Error('PresentationRequestInvalid: verifier JWKS is not valid JSON')
  }

  if (!isRecord(document) || !Array.isArray(document.keys)) {
    throw new Error('PresentationRequestInvalid: verifier JWKS keys are required')
  }

  const keys = document.keys.filter(isRecord)
  if (keys.length === 0) {
    throw new Error('PresentationRequestInvalid: verifier JWKS has no keys')
  }

  const kid = input.kid?.trim()
  if (kid) {
    const matched = keys.find((key) => readString(key.kid) === kid)
    if (!matched) {
      throw new Error('PresentationRequestInvalid: verifier signing key kid not found in JWKS')
    }
    return matched
  }

  if (keys.length === 1) return keys[0]!

  throw new Error('PresentationRequestInvalid: verifier signing key kid is required')
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))
}
