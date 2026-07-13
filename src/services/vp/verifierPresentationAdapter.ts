import { logWalletStep } from '../debug/walletLogger'
import type {
  PresentationGatewayClient,
  PresentationSession,
  PresentationSessionStatus,
  PresentationSessionStatusResponse,
} from './presentationGatewayClient'
import { resolveVerifierPresentationBaseUrl } from './verifierPresentationBaseUrl'

/** HTTP client for verifier-owned `/v1/presentation-sessions` + `/v1/present/verify` API. */
export function createVerifierPresentationAdapter(
  baseUrl: string = resolveVerifierPresentationBaseUrl(),
): PresentationGatewayClient {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

  return {
    async createSession(): Promise<PresentationSession> {
      const response = await fetch(`${normalizedBase}/v1/presentation-sessions`, { method: 'POST' })
      if (!response.ok) {
        throw new Error(`VpSessionCreateFailed:${response.status}`)
      }
      return response.json() as Promise<PresentationSession>
    },

    async uploadPresentation(
      sessionId: string,
      input: { vpToken: string; credentialType: string },
    ): Promise<void> {
      const response = await fetch(`${normalizedBase}/v1/presentation-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (response.status === 409) {
        throw new Error('VpSessionUploadConflict')
      }
      if (!response.ok) {
        throw new Error(`VpSessionUploadFailed:${response.status}`)
      }
      logWalletStep('vp-verifier', 'upload-complete', {
        sessionPrefix: sessionId.slice(0, 8),
        vpBytes: input.vpToken.length,
      })
    },

    async fetchSessionStatus(sessionId: string): Promise<PresentationSessionStatusResponse> {
      const response = await fetch(`${normalizedBase}/v1/presentation-sessions/${sessionId}/status`)
      if (response.status === 404) {
        throw new Error('VpSessionNotFound')
      }
      if (!response.ok) {
        throw new Error(`VpSessionStatusFailed:${response.status}`)
      }

      const body = (await response.json()) as {
        status: PresentationSessionStatus | 'not-found'
        reason?: string
      }
      if (body.status === 'not-found') {
        throw new Error('VpSessionNotFound')
      }
      return {
        status: body.status,
        ...(body.reason ? { reason: body.reason } : {}),
      }
    },
  }
}

let defaultClient: PresentationGatewayClient | undefined

export function getDefaultVerifierPresentationClient(): PresentationGatewayClient {
  if (!defaultClient) {
    defaultClient = createVerifierPresentationAdapter()
  }
  return defaultClient
}

export function setDefaultVerifierPresentationClientForTests(client: PresentationGatewayClient | undefined): void {
  defaultClient = client
}
