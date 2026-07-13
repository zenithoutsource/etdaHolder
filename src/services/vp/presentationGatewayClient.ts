export type PresentationSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  verifyUrl: string
}

export type PresentationSessionStatus =
  | 'pending'
  | 'ready'
  | 'verified'
  | 'verify_failed'
  | 'expired'

export type PresentationSessionStatusResponse = {
  status: PresentationSessionStatus
  reason?: string
}

export interface PresentationGatewayClient {
  createSession(input?: { credentialType?: string }): Promise<PresentationSession>
  uploadPresentation(
    sessionId: string,
    input: { vpToken: string; credentialType: string },
  ): Promise<void>
  fetchSessionStatus(sessionId: string): Promise<PresentationSessionStatusResponse>
}
