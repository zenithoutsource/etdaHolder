import type { ServerConfig } from '../config'
import type { VerifiedVpClaim } from './sdJwtVerifier'
import { verifySdJwtKbPresentation } from './sdJwtVerifier'
import type { PresentationSessionStore, PresentationSessionStatus } from './presentationSessionStore'

export type UploadPresentationOutcome =
  | { ok: true }
  | { ok: false; code: 'bad-request' | 'not-found' | 'expired' | 'conflict' }

export type VerifyPresentationOutcome =
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'consumed' }
  | { kind: 'pending' }
  | { kind: 'verify-failed'; reason: string; credentialType: string; vpBytes: number }
  | { kind: 'success'; credentialType: string; issuerName: string; claims: VerifiedVpClaim[]; presentedAt: string }

export function createDevVpSession(
  store: PresentationSessionStore,
  ttlMs: number,
): { sessionId: string; nonce: string; expiresAt: string } {
  const session = store.createSession(ttlMs)
  return {
    sessionId: session.sessionId,
    nonce: session.nonce,
    expiresAt: session.expiresAt,
  }
}

export function uploadPresentation(
  store: PresentationSessionStore,
  sessionId: string,
  vpToken: string,
  credentialType: string,
): UploadPresentationOutcome {
  if (!vpToken || !credentialType) {
    return { ok: false, code: 'bad-request' }
  }

  const outcome = store.setVpToken(sessionId, vpToken, credentialType)
  if (outcome === 'not-found') return { ok: false, code: 'not-found' }
  if (outcome === 'expired') return { ok: false, code: 'expired' }
  if (outcome === 'already-set' || outcome === 'consumed') return { ok: false, code: 'conflict' }
  return { ok: true }
}

export function fetchPresentationSessionStatus(
  store: PresentationSessionStore,
  sessionId: string,
): PresentationSessionStatus | 'not-found' {
  return store.resolveStatus(sessionId)
}

export async function verifyPresentationSession(
  store: PresentationSessionStore,
  sessionId: string,
  config: Pick<
    ServerConfig,
    'verifierPresentationBaseUrl' | 'vpSessionTtlMs' | 'vpIssuerPublicKeyJwk'
  >,
  options?: { verifierBaseUrl?: string },
): Promise<VerifyPresentationOutcome> {
  const session = store.getSession(sessionId)
  if (!session) return { kind: 'not-found' }
  if (session.verificationOutcome === 'verified') return { kind: 'consumed' }
  if (session.verificationOutcome === 'verify_failed') {
    return {
      kind: 'verify-failed',
      reason: session.verificationReason ?? 'unknown',
      credentialType: session.credentialType,
      vpBytes: session.vpToken?.length ?? 0,
    }
  }
  if (store.isExpired(session)) return { kind: 'expired' }
  if (!session.vpToken) return { kind: 'pending' }

  const verifierBaseUrl = options?.verifierBaseUrl ?? config.verifierPresentationBaseUrl
  const verified = verifySdJwtKbPresentation(session.vpToken, {
    nonce: session.nonce,
    relayBaseUrl: verifierBaseUrl,
    maxAgeMs: config.vpSessionTtlMs,
    issuerPublicKeyJwk: config.vpIssuerPublicKeyJwk,
  })

  if (!verified.ok) {
    store.finalizeVerification(sessionId, { outcome: 'verify_failed', reason: verified.reason })
    return {
      kind: 'verify-failed',
      reason: verified.reason,
      credentialType: session.credentialType,
      vpBytes: session.vpToken.length,
    }
  }

  store.finalizeVerification(sessionId, { outcome: 'verified' })
  return {
    kind: 'success',
    credentialType: session.credentialType,
    issuerName: verified.issuerName,
    claims: verified.claims,
    presentedAt: new Date().toISOString(),
  }
}

export async function verifyDevVpSession(
  store: PresentationSessionStore,
  sessionId: string,
  config: Pick<ServerConfig, 'verifierPresentationBaseUrl' | 'vpSessionTtlMs' | 'vpIssuerPublicKeyJwk'>,
): Promise<VerifyPresentationOutcome> {
  return verifyPresentationSession(store, sessionId, config, {
    verifierBaseUrl: config.verifierPresentationBaseUrl,
  })
}
