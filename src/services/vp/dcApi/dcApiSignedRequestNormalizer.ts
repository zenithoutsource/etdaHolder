/**
 * Normalizes OID4VP DC API signed request bodies to compact JAR strings.
 */
import { looksLikeCompactJwt, readString } from '@/src/utils/jwtUtils'
import { isRecord } from '@/src/utils/jwtUtils'

export type SignedDcApiRequestShape = {
  keys: string[]
  hasRequest: boolean
  hasPayload: boolean
  hasSignatures: boolean
  requestLooksLikeJwt: boolean
  requestLooksLikeHttpsUri: boolean
  hasRequestUri: boolean
}

export function readSignedDcApiRequestShape(request: Record<string, unknown>): SignedDcApiRequestShape {
  const requestValue = readString(request.request)
  return {
    keys: Object.keys(request),
    hasRequest: Boolean(requestValue),
    hasPayload: Boolean(readString(request.payload)),
    hasSignatures: Array.isArray(request.signatures),
    requestLooksLikeJwt: Boolean(requestValue && looksLikeCompactJwt(requestValue)),
    requestLooksLikeHttpsUri: Boolean(requestValue && readHttpsUri(requestValue)),
    hasRequestUri: Boolean(readHttpsUri(readString(request.request_uri))),
  }
}

export function readCompactJarFromSignedDcApiRequest(
  request: Record<string, unknown>,
): string | undefined {
  const compactRequest = readString(request.request)
  if (compactRequest && looksLikeCompactJwt(compactRequest)) {
    return compactRequest
  }

  return readCompactJarFromJwsJsonSerialization(request)
}

export async function resolveCompactJarFromSignedDcApiRequest(
  request: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const inlineJar = readCompactJarFromSignedDcApiRequest(request)
  if (inlineJar) return inlineJar

  const requestUri = readSignedDcApiRequestUri(request)
  if (!requestUri) {
    throw new Error(
      'PresentationRequestInvalid: signed dc_api requires a compact JAR, JWS JSON payload, or HTTPS request_uri',
    )
  }

  const response = await fetchImpl(requestUri, { method: 'GET' })
  if (!response.ok) {
    throw new Error('PresentationRequestFetchFailed: signed dc_api request_uri could not be fetched')
  }

  const body = (await response.text()).trim()
  if (!looksLikeCompactJwt(body)) {
    throw new Error('PresentationRequestInvalid: signed dc_api request_uri must return a compact JAR')
  }

  return body
}

function readSignedDcApiRequestUri(request: Record<string, unknown>): string | undefined {
  return readHttpsUri(readString(request.request_uri)) ?? readHttpsUri(readString(request.request))
}

function readHttpsUri(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

function readCompactJarFromJwsJsonSerialization(
  request: Record<string, unknown>,
): string | undefined {
  const payloadSegment = readString(request.payload)
  const signatures = request.signatures
  if (!payloadSegment || !Array.isArray(signatures) || signatures.length === 0) {
    return undefined
  }

  const signatureEntry = signatures.find((entry) => isRecord(entry))
  if (!signatureEntry || !isRecord(signatureEntry)) return undefined

  const protectedSegment = readString(signatureEntry.protected)
  const signatureSegment = readString(signatureEntry.signature)
  if (!protectedSegment || !signatureSegment) return undefined

  const compactJar = `${protectedSegment}.${payloadSegment}.${signatureSegment}`
  return looksLikeCompactJwt(compactJar) ? compactJar : undefined
}
