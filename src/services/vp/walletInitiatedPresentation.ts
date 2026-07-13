import { getCardSchema } from '../../config/cardSchemas'
import { signSdJwtKbPresentationToken } from '../crypto/crypto'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { maybeConsumeSingleUseCredential } from '../credentials/singleUseCredentialConsumption'
import { recordWalletPresentationSuccess } from '../history/recordWalletPresentationSuccess'
import type {
  PresentationGatewayClient,
  PresentationSession,
  PresentationSessionStatusResponse,
} from './presentationGatewayClient'
import {
  createVerifierPresentationAdapter,
  getDefaultVerifierPresentationClient,
} from './verifierPresentationAdapter'
import { resolveVerifierPresentationBaseUrl } from './verifierPresentationBaseUrl'

export type VpSessionResponse = PresentationSession

export function isSdJwtCredential(record: VerifiableCredentialRecord): boolean {
  return record.rawVc.includes('~')
}

export async function createVpSession(
  client: PresentationGatewayClient = getDefaultVerifierPresentationClient(),
): Promise<VpSessionResponse> {
  return client.createSession()
}

export async function buildWalletInitiatedVpToken(
  record: VerifiableCredentialRecord,
  session: { nonce: string },
): Promise<string> {
  return signSdJwtKbPresentationToken({
    audience: resolveVerifierPresentationBaseUrl(),
    nonce: session.nonce,
    sdJwt: record.rawVc,
  })
}

export async function submitVpToSession(
  sessionId: string,
  vpToken: string,
  credentialType: string,
  client: PresentationGatewayClient = getDefaultVerifierPresentationClient(),
): Promise<void> {
  await client.uploadPresentation(sessionId, { vpToken, credentialType })
}

export type VpSessionStatusResponse = PresentationSessionStatusResponse

export async function fetchVpSessionStatus(
  sessionId: string,
  client: PresentationGatewayClient = getDefaultVerifierPresentationClient(),
): Promise<VpSessionStatusResponse> {
  return client.fetchSessionStatus(sessionId)
}

export function buildQrUrl(session: Pick<PresentationSession, 'verifyUrl' | 'sessionId'>): string {
  if (session.verifyUrl) {
    return session.verifyUrl
  }
  const baseUrl = resolveVerifierPresentationBaseUrl()
  return `${baseUrl}/v1/present/verify?s=${encodeURIComponent(session.sessionId)}`
}

export function readWalletInitiatedClaimLabels(record: VerifiableCredentialRecord): string[] {
  const schema = getCardSchema(record.type)
  return schema.displayFields
    .filter((field) => record.claims[field.key] !== undefined && record.claims[field.key] !== '')
    .map((field) => field.presentationLabel ?? field.label)
}

export function recordWalletInitiatedPresentationHistory(
  record: VerifiableCredentialRecord,
): { consumed: boolean } {
  const schema = getCardSchema(record.type)
  recordWalletPresentationSuccess({
    credentialId: record.id,
    documentType: schema.title,
    partyName: 'Verifier',
    disclosedClaims: readWalletInitiatedClaimLabels(record),
    channel: 'wallet',
  })
  return maybeConsumeSingleUseCredential({
    credentialId: record.id,
    credentialType: record.type,
  })
}

export { createVerifierPresentationAdapter, createRelayPresentationGatewayAdapter } from './relayPresentationGatewayAdapter'
