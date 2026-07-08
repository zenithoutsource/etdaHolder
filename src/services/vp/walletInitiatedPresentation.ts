import { getCardSchema } from '../../config/cardSchemas'
import { signSdJwtKbPresentationToken } from '../crypto/crypto'
import { logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { recordWalletPresentationSuccess } from '../history/recordWalletPresentationSuccess'
import { resolveVpRelayBaseUrl } from './vpRelayBaseUrl'

export type VpSessionResponse = {
  sessionId: string
  nonce: string
  expiresAt: string
}

export function isSdJwtCredential(record: VerifiableCredentialRecord): boolean {
  return record.rawVc.includes('~')
}

export async function createVpSession(): Promise<VpSessionResponse> {
  const baseUrl = resolveVpRelayBaseUrl()
  const response = await fetch(`${baseUrl}/dev/vp-session`, { method: 'POST' })
  if (!response.ok) {
    throw new Error(`VpSessionCreateFailed:${response.status}`)
  }
  return response.json() as Promise<VpSessionResponse>
}

export async function buildWalletInitiatedVpToken(
  record: VerifiableCredentialRecord,
  session: { nonce: string },
): Promise<string> {
  return signSdJwtKbPresentationToken({
    audience: resolveVpRelayBaseUrl(),
    nonce: session.nonce,
    sdJwt: record.rawVc,
  })
}

export async function submitVpToSession(
  sessionId: string,
  vpToken: string,
  credentialType: string,
): Promise<void> {
  const baseUrl = resolveVpRelayBaseUrl()
  const response = await fetch(`${baseUrl}/dev/vp-session/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vpToken, credentialType }),
  })
  if (response.status === 409) {
    throw new Error('VpSessionUploadConflict')
  }
  if (!response.ok) {
    throw new Error(`VpSessionUploadFailed:${response.status}`)
  }
  logWalletStep('vp-relay', 'upload-complete', {
    sessionPrefix: sessionId.slice(0, 8),
    vpBytes: vpToken.length,
  })
}

export function buildQrUrl(sessionId: string): string {
  return `${resolveVpRelayBaseUrl()}/dev/vp-verify?s=${encodeURIComponent(sessionId)}`
}

export function readWalletInitiatedClaimLabels(record: VerifiableCredentialRecord): string[] {
  const schema = getCardSchema(record.type)
  return schema.displayFields
    .filter((field) => record.claims[field.key] !== undefined && record.claims[field.key] !== '')
    .map((field) => field.presentationLabel ?? field.label)
}

export function recordWalletInitiatedPresentationHistory(
  record: VerifiableCredentialRecord,
): void {
  const schema = getCardSchema(record.type)
  recordWalletPresentationSuccess({
    credentialId: record.id,
    documentType: schema.title,
    partyName: 'VP Relay (dev)',
    disclosedClaims: readWalletInitiatedClaimLabels(record),
    channel: 'wallet',
  })
}
