/**
 * Normalizes Android Credential Manager platform events into the shared DC API session pipeline.
 */
import { isRecord } from '@/src/utils/jwtUtils'

import type { DcApiIncomingRequest, DcApiProtocol } from './dcApiRequestParser'

export type DcApiTransport = 'same_device' | 'cross_device'

export type DcApiPlatformPresentationEvent = {
  sessionId: string
  protocol: DcApiProtocol
  origin: string
  request: string
  selectedCredentialId?: string | null
  transport?: string | null
}

export type NormalizedDcApiIncomingRequest = DcApiIncomingRequest & {
  transport: DcApiTransport
  selectedCredentialId?: string | null
}

export function readDcApiTransport(raw: string | null | undefined): DcApiTransport {
  return raw === 'cross_device' ? 'cross_device' : 'same_device'
}

export function normalizePlatformDcApiEvent(
  event: DcApiPlatformPresentationEvent,
): NormalizedDcApiIncomingRequest {
  const request = parsePlatformRequestBody(event.request)
  if (!request) {
    throw new Error('PresentationRequestInvalid: DC API platform request JSON is invalid')
  }

  return {
    sessionId: event.sessionId,
    protocol: event.protocol,
    origin: event.origin,
    request,
    transport: readDcApiTransport(event.transport),
    ...(event.selectedCredentialId ? { selectedCredentialId: event.selectedCredentialId } : {}),
  }
}

function parsePlatformRequestBody(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return null

    const requests = parsed.requests
    if (Array.isArray(requests) && isRecord(requests[0])) {
      return unwrapPlatformRequestObject(requests[0])
    }

    return unwrapPlatformRequestObject(parsed)
  } catch {
    return null
  }
}

function unwrapPlatformRequestObject(value: Record<string, unknown>): Record<string, unknown> | null {
  const protocol = typeof value.protocol === 'string' ? value.protocol : ''
  const data = value.data
  if (protocol && typeof data === 'string' && data.trim().length > 0) {
    const trimmedData = data.trim()
    if (trimmedData.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmedData) as unknown
        if (isRecord(parsed)) return parsed
      } catch {
        return null
      }
    }
    return { request: trimmedData }
  }

  const dataRecord = isRecord(data) ? data : null
  if (protocol && dataRecord) {
    return dataRecord
  }

  if (typeof value.request === 'string' && value.request.trim().length > 0) {
    return value
  }

  if (value.response_mode || value.dcql_query || value.payload) {
    return value
  }

  return null
}
