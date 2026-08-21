import {
  WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY,
  WALLET_ATTEST_WIA_KEY,
  WALLET_ATTEST_WUA_KEY,
  WALLET_CRYPTO_V2_META_KEY,
  isWalletAttestationRequested,
  readWalletAttestChallengeUnsupportedTtlMs,
} from '@/src/config/walletCryptoPolicy'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { readStoredCredentials } from '../credentials/storedCredentials'
import { getMetaStorage } from '../storage/storage'

import { listCredentialKeyRecords } from './credentialKeyRegistry'
import { getHardwareEcdsaSigner } from './hardwareEcdsaSigner'
import { WALLET_P256_ATTEST_ALIAS } from './hardwareEcdsaTypes'
import { hasWalletKey } from './walletKeyRegistration'
import {
  createWalletAttestClient,
  isWalletAttestChallengeNotFound,
  type WalletAttestationChallenge,
  type WalletAttestationRequest,
} from './walletAttestClient'
import { destroyWalletAttestKey } from './walletAttestKey'
import {
  beginWalletActivationWpSubmission,
  hasPersistedActivationAttestationArtifacts,
  markWalletActivationComplete,
  markWalletActivationKeyCreated,
  markWalletActivationWpRejected,
  markWalletActivationWpSubmitted,
  readWalletActivationTransaction,
  requireAttestationChallengeForProductionAttestCreate,
  startWalletActivationTransaction,
  type WalletActivationTransaction,
} from './walletActivationTransaction'

type CachedAttestation = {
  value: string
  expiresAt: string
}

export function isWalletCryptoV2Enabled(): boolean {
  return getMetaStorage().getString(WALLET_CRYPTO_V2_META_KEY) === 'true'
}

export function detectLegacySingleKeyWallet(): boolean {
  if (isWalletCryptoV2Enabled()) return false
  if (!hasWalletKey()) return false
  if (readStoredCredentials().length === 0) return false
  return listCredentialKeyRecords().length === 0
}

function writeCachedAttestation(key: string, value: string, expiresAt: string): void {
  const record: CachedAttestation = { value, expiresAt }
  getMetaStorage().set(key, JSON.stringify(record))
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)!
  return out
}

function toAttestationRequest(tx: WalletActivationTransaction): WalletAttestationRequest {
  if (!hasPersistedActivationAttestationArtifacts(tx) || !tx.submissionIdempotencyKey) {
    throw new Error('WalletActivationAttestationArtifactsMissing')
  }

  return {
    challengeId: tx.challengeId,
    pubKAttestJwk: tx.publicJwk,
    certificateChainDerBase64: tx.certificateChainDerBase64,
    submissionIdempotencyKey: tx.submissionIdempotencyKey,
  }
}

function isAmbiguousWalletAttestFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/WalletAttestRequestFailed:(\d+)/)
  if (!match?.[1]) return true
  const status = Number(match[1])
  return status >= 500 || status === 409
}

async function submitPersistedAttestation(tx: WalletActivationTransaction): Promise<void> {
  const pending = beginWalletActivationWpSubmission()
  try {
    const attestation = await createWalletAttestClient().requestAttestations(toAttestationRequest(pending))
    markWalletActivationWpSubmitted()
    writeCachedAttestation(WALLET_ATTEST_WUA_KEY, attestation.wua, attestation.expiresAt)
    writeCachedAttestation(WALLET_ATTEST_WIA_KEY, attestation.wia, attestation.expiresAt)
    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    markWalletActivationComplete()
    await destroyWalletAttestKey()
    logWalletStep('crypto', 'wallet-crypto-v2-activated', { expiresAt: attestation.expiresAt })
  } catch (error) {
    logWalletError('crypto', 'wallet-attest-submit-failed', error)
    if (!isAmbiguousWalletAttestFailure(error)) {
      markWalletActivationWpRejected()
    }
    throw error
  }
}

function isChallengeUnsupportedCached(): boolean {
  const until = Number(getMetaStorage().getString(WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY))
  return Number.isFinite(until) && Date.now() < until
}

function markChallengeUnsupported(): void {
  const until = Date.now() + readWalletAttestChallengeUnsupportedTtlMs()
  getMetaStorage().set(WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY, String(until))
}

function clearChallengeUnsupported(): void {
  getMetaStorage().remove(WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY)
}

function skipOrThrowMissingChallenge(error: unknown): boolean {
  if (!isWalletAttestChallengeNotFound(error)) return false
  if (isWalletAttestationRequested()) {
    logWalletError('crypto', 'wallet-attest-challenge-required', error)
    throw error
  }
  markChallengeUnsupported()
  logWalletStep('crypto', 'wallet-attest-challenge-unsupported', {
    retryAfterMs: readWalletAttestChallengeUnsupportedTtlMs(),
  })
  return true
}

let activateWalletCryptoV2InFlight: Promise<void> | undefined

export async function activateWalletCryptoV2(): Promise<void> {
  if (activateWalletCryptoV2InFlight) return activateWalletCryptoV2InFlight
  activateWalletCryptoV2InFlight = activateWalletCryptoV2Unlocked().finally(() => {
    activateWalletCryptoV2InFlight = undefined
  })
  return activateWalletCryptoV2InFlight
}

async function activateWalletCryptoV2Unlocked(): Promise<void> {
  const signer = getHardwareEcdsaSigner()
  const hasAttestKey = await signer.hasKey(WALLET_P256_ATTEST_ALIAS)
  const tx = readWalletActivationTransaction()

  if (hasAttestKey && tx?.phase === 'activated') {
    if (!isWalletCryptoV2Enabled()) {
      getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    }
    logWalletStep('crypto', 'wallet-crypto-v2-already-enabled')
    return
  }

  if (
    tx &&
    hasPersistedActivationAttestationArtifacts(tx) &&
    (tx.phase === 'wp_submit_pending' ||
      tx.phase === 'wp_submitted' ||
      (tx.phase === 'key_created' && Boolean(tx.submissionIdempotencyKey)))
  ) {
    logWalletStep('crypto', 'wallet-crypto-v2-resubmit-wp', { phase: tx.phase })
    await submitPersistedAttestation(tx)
    return
  }

  if (!isWalletAttestationRequested() && isChallengeUnsupportedCached()) {
    logWalletStep('crypto', 'wallet-attest-challenge-unsupported-cached')
    return
  }

  let challenge: WalletAttestationChallenge
  try {
    challenge = await createWalletAttestClient().requestAttestationChallenge()
    clearChallengeUnsupported()
  } catch (error) {
    if (skipOrThrowMissingChallenge(error)) return
    throw error
  }
  const challengeBytes = base64ToBytes(challenge.attestationChallengeBase64)
  requireAttestationChallengeForProductionAttestCreate(challengeBytes, true)

  if (hasAttestKey) {
    await signer.deleteKey(WALLET_P256_ATTEST_ALIAS)
  }

  startWalletActivationTransaction(challenge.challengeId)
  logWalletStep('crypto', 'wallet-crypto-v2-create-attest-key')
  const created = await signer.createKey(WALLET_P256_ATTEST_ALIAS, {
    attestationChallenge: challengeBytes,
  })
  if (!created.certificateChainDer || created.certificateChainDer.length === 0) {
    throw new Error('AttestKeyCertificateChainRequired')
  }

  markWalletActivationKeyCreated({
    challengeId: challenge.challengeId,
    publicJwk: created.publicJwk,
    certificateChainDer: created.certificateChainDer,
    securityLevelHint: created.securityLevel,
  })

  await submitPersistedAttestation(readWalletActivationTransaction() as WalletActivationTransaction)
}

export function readCachedWalletAttestations(): { wua?: CachedAttestation; wia?: CachedAttestation } {
  const parse = (raw: string | undefined): CachedAttestation | undefined => {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as Partial<CachedAttestation>
      if (typeof parsed.value === 'string' && typeof parsed.expiresAt === 'string') {
        return parsed as CachedAttestation
      }
    } catch {
      return undefined
    }
    return undefined
  }

  return {
    wua: parse(getMetaStorage().getString(WALLET_ATTEST_WUA_KEY)),
    wia: parse(getMetaStorage().getString(WALLET_ATTEST_WIA_KEY)),
  }
}
