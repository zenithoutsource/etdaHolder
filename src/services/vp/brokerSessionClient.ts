import { logWalletStep } from '../debug/walletLogger'
import { resolveBrokerBaseUrl } from './brokerBaseUrl'

export type BrokerCreateSessionRequest = {
  walletId: string
  deviceToken: string
  platform: 'android' | 'ios'
}

export type BrokerCreateSessionResponse = {
  session_id: string
  broker_request_endpoint: string
  expires_at: string
  qr_payload: string
}

export type BrokerSessionClient = {
  createSession(input: BrokerCreateSessionRequest): Promise<BrokerCreateSessionResponse>
  fetchPresentationRequestUri(sessionId: string): Promise<string | null>
}

/** Thrown by normalizeBrokerPresentationRequest when the broker body matches none of the locked v1 shapes. */
export class BrokerPresentationRequestInvalid extends Error {
  constructor() {
    super('BrokerPresentationRequestInvalid')
    this.name = 'BrokerPresentationRequestInvalid'
  }
}

const OPENID4VP_SCHEME_PATTERN = /^openid4vp:/i
const HTTP_REQUEST_URI_PATTERN = /^https?:\/\/.*(response_type=vp_token|request_uri=)/i

/**
 * Normalizes a broker GET `/broker/session/:id/request` body into the URI consumed by
 * `resolvePresentationRequest`, or `null` while the verifier has not deposited a request yet.
 */
export function normalizeBrokerPresentationRequest(body: unknown): string | null {
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (trimmed.length === 0) return null
    if (OPENID4VP_SCHEME_PATTERN.test(trimmed) || HTTP_REQUEST_URI_PATTERN.test(trimmed)) {
      return trimmed
    }
    throw new BrokerPresentationRequestInvalid()
  }

  if (body === null || body === undefined) return null

  if (typeof body === 'object') {
    const record = body as Record<string, unknown>

    if (typeof record.request_uri === 'string') return record.request_uri
    if (typeof record.authorization_request === 'string') return record.authorization_request
    if (typeof record.qr === 'string') return record.qr
    if (typeof record.openid4vp === 'string') return record.openid4vp

    if (Object.keys(record).length === 0) return null
    if (record.status === 'pending') return null

    throw new BrokerPresentationRequestInvalid()
  }

  throw new BrokerPresentationRequestInvalid()
}

export function createBrokerSessionClient(
  baseUrl = resolveBrokerBaseUrl(),
  fetchImpl: typeof fetch = fetch,
): BrokerSessionClient {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

  return {
    async createSession(input) {
      const response = await fetchImpl(`${normalizedBase}/broker/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        logWalletStep('vp-broker', 'create-session-failed', { status: response.status })
        throw new Error(`BrokerSessionCreateFailed:${response.status}`)
      }
      const json = (await response.json()) as BrokerCreateSessionResponse
      if (!json.session_id || !json.qr_payload || !json.expires_at) {
        throw new Error('BrokerSessionCreateFailed:invalid-response')
      }
      logWalletStep('vp-broker', 'create-session-complete', {
        sessionPrefix: json.session_id.slice(0, 8),
      })
      return json
    },

    async fetchPresentationRequestUri(sessionId) {
      const response = await fetchImpl(`${normalizedBase}/broker/session/${sessionId}/request`)
      if (response.status === 404 || response.status === 204) return null
      if (!response.ok) {
        logWalletStep('vp-broker', 'fetch-request-failed', {
          sessionPrefix: sessionId.slice(0, 8),
          status: response.status,
        })
        throw new Error(`BrokerPresentationRequestFetchFailed:${response.status}`)
      }

      const text = await response.text()
      if (!text.trim()) return null

      let body: unknown = text
      try {
        body = JSON.parse(text) as unknown
      } catch {
        // plain string body (e.g. an openid4vp:// URI), not JSON — use as-is
      }

      const uri = normalizeBrokerPresentationRequest(body)
      if (uri) {
        logWalletStep('vp-broker', 'fetch-request-ready', { sessionPrefix: sessionId.slice(0, 8) })
      }
      return uri
    },
  }
}
