import type { ServerConfig } from '../config'
import type { VerifiedVpClaim } from './sdJwtVerifier'
import { verifySdJwtKbPresentation, verifySdJwtKbPresentationAsync } from './sdJwtVerifier'
import type { PresentationSessionStore } from './presentationSessionStore'
import type { PresentationSessionStatus } from './presentationSessionStore'

export const V1_GATEWAY_CREDENTIAL_TYPE = 'ThaiNationalID'

export type CreatePresentationSessionResult = {
  sessionId: string
  nonce: string
  expiresAt: string
  verifyUrl: string
}

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

export function buildPresentationVerifyUrl(gatewayBaseUrl: string, sessionId: string): string {
  const base = gatewayBaseUrl.endsWith('/') ? gatewayBaseUrl.slice(0, -1) : gatewayBaseUrl
  return `${base}/v1/present/verify?s=${encodeURIComponent(sessionId)}`
}

export function buildDevVerifyUrl(relayBaseUrl: string, sessionId: string): string {
  const base = relayBaseUrl.endsWith('/') ? relayBaseUrl.slice(0, -1) : relayBaseUrl
  return `${base}/dev/vp-verify?s=${encodeURIComponent(sessionId)}`
}

export function createPresentationSession(
  store: PresentationSessionStore,
  config: Pick<ServerConfig, 'presentationSessionTtlMs' | 'verifierPresentationBaseUrl'>,
): CreatePresentationSessionResult {
  const session = store.createSession(config.presentationSessionTtlMs)
  return {
    sessionId: session.sessionId,
    nonce: session.nonce,
    expiresAt: session.expiresAt,
    verifyUrl: buildPresentationVerifyUrl(config.verifierPresentationBaseUrl, session.sessionId),
  }
}

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
  options?: { enforceThaiNationalId?: boolean },
): UploadPresentationOutcome {
  if (!vpToken || !credentialType) {
    return { ok: false, code: 'bad-request' }
  }
  if (options?.enforceThaiNationalId !== false && credentialType !== V1_GATEWAY_CREDENTIAL_TYPE) {
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
    'verifierPresentationBaseUrl' | 'presentationSessionTtlMs' | 'vpIssuerPublicKeyJwk' | 'presentationIssuerJwksCacheMs'
  >,
  options?: { verifierBaseUrl?: string; useAsyncIssuerResolve?: boolean },
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
  const verifyContext = {
    nonce: session.nonce,
    relayBaseUrl: verifierBaseUrl,
    maxAgeMs: config.presentationSessionTtlMs,
    issuerPublicKeyJwk: config.vpIssuerPublicKeyJwk,
    jwksCacheMs: config.presentationIssuerJwksCacheMs,
  }

  const verified =
    options?.useAsyncIssuerResolve !== false && !config.vpIssuerPublicKeyJwk
      ? await verifySdJwtKbPresentationAsync(session.vpToken, verifyContext)
      : verifySdJwtKbPresentation(session.vpToken, verifyContext)

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
  config: Pick<ServerConfig, 'vpRelayBaseUrl' | 'vpSessionTtlMs' | 'vpIssuerPublicKeyJwk' | 'presentationIssuerJwksCacheMs'>,
): Promise<VerifyPresentationOutcome> {
  return verifyPresentationSession(store, sessionId, {
    verifierPresentationBaseUrl: config.vpRelayBaseUrl,
    presentationSessionTtlMs: config.vpSessionTtlMs,
    vpIssuerPublicKeyJwk: config.vpIssuerPublicKeyJwk,
    presentationIssuerJwksCacheMs: config.presentationIssuerJwksCacheMs,
  }, { verifierBaseUrl: config.vpRelayBaseUrl, useAsyncIssuerResolve: false })
}
