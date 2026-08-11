import { randomBytes } from 'react-native-quick-crypto'

import { getCredentialStorage } from '../storage/storage'

import type { EcP256Jwk, HardwareSecurityLevel } from './hardwareEcdsaTypes'
import { WALLET_P256_ATTEST_ALIAS } from './hardwareEcdsaTypes'

export const WALLET_ACTIVATION_TX_KEY = 'wallet.activation.tx'

export type WalletActivationPhase =
  | 'challenge_received'
  | 'key_created'
  | 'wp_submit_pending'
  | 'wp_submitted'
  | 'activated'

export type WalletActivationTransaction = {
  phase: WalletActivationPhase
  challengeId: string
  attestAlias: string
  createdAt: string
  /** Public attestation JWK from challenged createKey; required for wp retry. */
  publicJwk?: EcP256Jwk
  /** Base64-encoded DER certs from createKey attestation chain; required for wp retry. */
  certificateChainDerBase64?: string[]
  securityLevelHint?: HardwareSecurityLevel
  /** Stable idempotency key persisted before the WP request is sent. */
  submissionIdempotencyKey?: string
  lastWpAttemptAt?: string
}

export type WalletActivationAttestationArtifacts = {
  publicJwk: EcP256Jwk
  certificateChainDer: Uint8Array[]
  securityLevelHint: HardwareSecurityLevel
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)!
  return out
}

function encodeCertificateChainDer(chain: Uint8Array[]): string[] {
  return chain.map((cert) => uint8ArrayToBase64(cert))
}

function decodeCertificateChainDer(chainBase64: string[]): Uint8Array[] {
  return chainBase64.map((cert) => base64ToUint8Array(cert))
}

function createSubmissionIdempotencyKey(): string {
  return randomBytes(16).toString('hex')
}

function parseWalletActivationTransaction(raw: string): WalletActivationTransaction | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<WalletActivationTransaction>
    if (
      (parsed.phase === 'challenge_received' ||
        parsed.phase === 'key_created' ||
        parsed.phase === 'wp_submit_pending' ||
        parsed.phase === 'wp_submitted' ||
        parsed.phase === 'activated') &&
      typeof parsed.challengeId === 'string' &&
      typeof parsed.attestAlias === 'string' &&
      typeof parsed.createdAt === 'string' &&
      (parsed.lastWpAttemptAt === undefined || typeof parsed.lastWpAttemptAt === 'string') &&
      (parsed.submissionIdempotencyKey === undefined || typeof parsed.submissionIdempotencyKey === 'string') &&
      (parsed.securityLevelHint === undefined ||
        parsed.securityLevelHint === 'STRONGBOX' ||
        parsed.securityLevelHint === 'TEE') &&
      (parsed.certificateChainDerBase64 === undefined ||
        (Array.isArray(parsed.certificateChainDerBase64) &&
          parsed.certificateChainDerBase64.every((entry) => typeof entry === 'string'))) &&
      (parsed.publicJwk === undefined ||
        (parsed.publicJwk.kty === 'EC' &&
          parsed.publicJwk.crv === 'P-256' &&
          typeof parsed.publicJwk.x === 'string' &&
          typeof parsed.publicJwk.y === 'string'))
    ) {
      return parsed as WalletActivationTransaction
    }
  } catch {
    return undefined
  }

  return undefined
}

export function hasPersistedActivationAttestationArtifacts(
  tx: WalletActivationTransaction | undefined,
): tx is WalletActivationTransaction & {
  publicJwk: EcP256Jwk
  certificateChainDerBase64: string[]
} {
  return Boolean(
    tx?.publicJwk &&
      tx.certificateChainDerBase64 &&
      tx.certificateChainDerBase64.length > 0 &&
      tx.publicJwk.kty === 'EC' &&
      tx.publicJwk.crv === 'P-256',
  )
}

export function readWalletActivationAttestationArtifacts(
  tx: WalletActivationTransaction | undefined,
): WalletActivationAttestationArtifacts | undefined {
  if (!hasPersistedActivationAttestationArtifacts(tx) || !tx.securityLevelHint) return undefined

  return {
    publicJwk: tx.publicJwk,
    certificateChainDer: decodeCertificateChainDer(tx.certificateChainDerBase64),
    securityLevelHint: tx.securityLevelHint,
  }
}

export function readWalletActivationTransaction(): WalletActivationTransaction | undefined {
  const raw = getCredentialStorage().getString(WALLET_ACTIVATION_TX_KEY)
  if (!raw) return undefined
  return parseWalletActivationTransaction(raw)
}

export function writeWalletActivationTransaction(tx: WalletActivationTransaction): void {
  getCredentialStorage().set(WALLET_ACTIVATION_TX_KEY, JSON.stringify(tx))
}

export function clearWalletActivationTransaction(): void {
  getCredentialStorage().remove(WALLET_ACTIVATION_TX_KEY)
}

export function startWalletActivationTransaction(challengeId: string): WalletActivationTransaction {
  const tx: WalletActivationTransaction = {
    phase: 'challenge_received',
    challengeId,
    attestAlias: WALLET_P256_ATTEST_ALIAS,
    createdAt: new Date().toISOString(),
  }
  writeWalletActivationTransaction(tx)
  return tx
}

export function markWalletActivationKeyCreated(input: {
  challengeId: string
  publicJwk: EcP256Jwk
  certificateChainDer: Uint8Array[]
  securityLevelHint: HardwareSecurityLevel
}): WalletActivationTransaction {
  const existing = readWalletActivationTransaction()
  const tx: WalletActivationTransaction = {
    phase: 'key_created',
    challengeId: input.challengeId,
    attestAlias: existing?.attestAlias ?? WALLET_P256_ATTEST_ALIAS,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    publicJwk: input.publicJwk,
    certificateChainDerBase64: encodeCertificateChainDer(input.certificateChainDer),
    securityLevelHint: input.securityLevelHint,
  }
  writeWalletActivationTransaction(tx)
  return tx
}

/**
 * Persist submission intent before calling WP so a crash after WP accepts
 * can resume with the same idempotency key and attestation artifacts.
 */
export function beginWalletActivationWpSubmission(): WalletActivationTransaction {
  const existing = readWalletActivationTransaction()
  if (!existing) throw new Error('WalletActivationTransactionMissing')
  if (!hasPersistedActivationAttestationArtifacts(existing)) {
    throw new Error('WalletActivationAttestationArtifactsMissing')
  }

  const tx: WalletActivationTransaction = {
    ...existing,
    phase: 'wp_submit_pending',
    submissionIdempotencyKey: existing.submissionIdempotencyKey ?? createSubmissionIdempotencyKey(),
    lastWpAttemptAt: new Date().toISOString(),
  }
  writeWalletActivationTransaction(tx)
  return tx
}

export function markWalletActivationWpSubmitted(): WalletActivationTransaction {
  const existing = readWalletActivationTransaction()
  if (!existing) throw new Error('WalletActivationTransactionMissing')
  if (existing.phase !== 'wp_submit_pending' && existing.phase !== 'key_created') {
    throw new Error('WalletActivationInvalidPhaseForWpSubmitted')
  }

  const tx: WalletActivationTransaction = {
    ...existing,
    phase: 'wp_submitted',
    lastWpAttemptAt: new Date().toISOString(),
  }
  writeWalletActivationTransaction(tx)
  return tx
}

export function markWalletActivationWpRejected(): WalletActivationTransaction {
  const existing = readWalletActivationTransaction()
  if (!existing) throw new Error('WalletActivationTransactionMissing')

  const tx: WalletActivationTransaction = {
    ...existing,
    phase: 'key_created',
    submissionIdempotencyKey: undefined,
  }
  writeWalletActivationTransaction(tx)
  return tx
}

export function markWalletActivationComplete(): WalletActivationTransaction {
  const existing = readWalletActivationTransaction()
  if (!existing) throw new Error('WalletActivationTransactionMissing')

  const tx: WalletActivationTransaction = {
    ...existing,
    phase: 'activated',
  }
  writeWalletActivationTransaction(tx)
  return tx
}

export function isWalletActivationOperational(): boolean {
  return readWalletActivationTransaction()?.phase === 'activated'
}

export type ActivationRetryDecision =
  | { action: 'noop'; reason: 'already_activated' }
  | {
      action: 'resubmit_wp'
      reason: 'wp_submitted' | 'wp_submit_pending' | 'key_created_with_artifacts'
    }
  | { action: 'recreate_key'; reason: 'new_challenge_or_unactivated_key' | 'missing_artifacts' }

/**
 * Decide whether activation should recreate k_attest or resubmit WUA/WIA.
 */
export function decideActivationRetry(
  tx: WalletActivationTransaction | undefined,
  newChallengeId: string,
  hasUnactivatedAttestKey: boolean,
): ActivationRetryDecision {
  if (tx?.phase === 'activated') {
    return { action: 'noop', reason: 'already_activated' }
  }

  if (tx && tx.challengeId === newChallengeId && hasPersistedActivationAttestationArtifacts(tx)) {
    if (tx.phase === 'wp_submitted') {
      return { action: 'resubmit_wp', reason: 'wp_submitted' }
    }
    if (tx.phase === 'wp_submit_pending') {
      return { action: 'resubmit_wp', reason: 'wp_submit_pending' }
    }
    if (tx.phase === 'key_created') {
      return { action: 'resubmit_wp', reason: 'key_created_with_artifacts' }
    }
  }

  if (tx && tx.challengeId === newChallengeId && !hasPersistedActivationAttestationArtifacts(tx)) {
    return { action: 'recreate_key', reason: 'missing_artifacts' }
  }

  if (
    hasUnactivatedAttestKey ||
    !tx ||
    tx.phase === 'challenge_received' ||
    tx.challengeId !== newChallengeId
  ) {
    return { action: 'recreate_key', reason: 'new_challenge_or_unactivated_key' }
  }

  return { action: 'recreate_key', reason: 'new_challenge_or_unactivated_key' }
}

export function requireAttestationChallengeForProductionAttestCreate(
  attestationChallenge: Uint8Array | undefined,
  isProductionBuild: boolean,
): void {
  if (!isProductionBuild) return
  if (!attestationChallenge || attestationChallenge.length === 0) {
    throw new Error('AttestKeyChallengeRequired: production k_attest must be created with attestationChallenge')
  }
}
