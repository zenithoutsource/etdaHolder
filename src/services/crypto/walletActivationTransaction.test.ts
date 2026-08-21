import { getCredentialStorage } from '../storage/storage'
import {
  beginWalletActivationWpSubmission,
  clearWalletActivationTransaction,
  decideActivationRetry,
  hasPersistedActivationAttestationArtifacts,
  markWalletActivationComplete,
  markWalletActivationKeyCreated,
  markWalletActivationWpRejected,
  markWalletActivationWpSubmitted,
  readWalletActivationAttestationArtifacts,
  readWalletActivationTransaction,
  requireAttestationChallengeForProductionAttestCreate,
  startWalletActivationTransaction,
  writeWalletActivationTransaction,
} from './walletActivationTransaction'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

const SAMPLE_JWK = {
  kty: 'EC' as const,
  crv: 'P-256' as const,
  x: 'test-x',
  y: 'test-y',
}

const SAMPLE_CHAIN = [new Uint8Array([0x30, 0x03, 0x01, 0x02, 0x03])]

function mockStorage() {
  const values = new Map<string, string>()
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
      return true
    }),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { storage, values }
}

function seedKeyCreatedTransaction(challengeId = 'challenge-1') {
  startWalletActivationTransaction(challengeId)
  markWalletActivationKeyCreated({
    challengeId,
    publicJwk: SAMPLE_JWK,
    certificateChainDer: SAMPLE_CHAIN,
    securityLevelHint: 'STRONGBOX',
  })
}

describe('walletActivationTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('startWalletActivationTransaction persists challenge_received phase', () => {
    mockStorage()
    const tx = startWalletActivationTransaction('challenge-1')
    expect(tx.phase).toBe('challenge_received')
    expect(readWalletActivationTransaction()?.challengeId).toBe('challenge-1')
  })

  test('markWalletActivationKeyCreated persists attestation artifacts for retry', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    const tx = readWalletActivationTransaction()

    expect(hasPersistedActivationAttestationArtifacts(tx)).toBe(true)
    expect(readWalletActivationAttestationArtifacts(tx)).toEqual({
      publicJwk: SAMPLE_JWK,
      certificateChainDer: SAMPLE_CHAIN,
      securityLevelHint: 'STRONGBOX',
    })
  })

  test('beginWalletActivationWpSubmission persists wp_submit_pending before WP call', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    const tx = beginWalletActivationWpSubmission()

    expect(tx.phase).toBe('wp_submit_pending')
    expect(tx.submissionIdempotencyKey).toEqual(expect.any(String))
    expect(readWalletActivationTransaction()?.phase).toBe('wp_submit_pending')
  })

  test('beginWalletActivationWpSubmission reuses the same idempotency key on retry', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    const first = beginWalletActivationWpSubmission()
    const second = beginWalletActivationWpSubmission()

    expect(second.submissionIdempotencyKey).toBe(first.submissionIdempotencyKey)
  })

  test('markWalletActivationWpSubmitted advances from wp_submit_pending', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    beginWalletActivationWpSubmission()
    const tx = markWalletActivationWpSubmitted()

    expect(tx.phase).toBe('wp_submitted')
    expect(tx.publicJwk).toEqual(SAMPLE_JWK)
    expect(tx.certificateChainDerBase64).toHaveLength(1)
  })

  test('markWalletActivationComplete advances to activated', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    beginWalletActivationWpSubmission()
    markWalletActivationWpSubmitted()
    const tx = markWalletActivationComplete()
    expect(tx.phase).toBe('activated')
  })

  test('decideActivationRetry resubmits wp for wp_submit_pending with same challenge', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    beginWalletActivationWpSubmission()

    expect(decideActivationRetry(readWalletActivationTransaction(), 'challenge-1', true)).toEqual({
      action: 'resubmit_wp',
      reason: 'wp_submit_pending',
    })
  })

  test('decideActivationRetry resubmits wp for wp_submitted with same challenge', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    beginWalletActivationWpSubmission()
    markWalletActivationWpSubmitted()

    expect(decideActivationRetry(readWalletActivationTransaction(), 'challenge-1', true)).toEqual({
      action: 'resubmit_wp',
      reason: 'wp_submitted',
    })
  })

  test('decideActivationRetry recreates key on new challenge', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    const tx = readWalletActivationTransaction()

    expect(decideActivationRetry(tx, 'challenge-2', true)).toEqual({
      action: 'recreate_key',
      reason: 'new_challenge_or_unactivated_key',
    })
  })

  test('decideActivationRetry is noop when already activated', () => {
    mockStorage()
    writeWalletActivationTransaction({
      phase: 'activated',
      challengeId: 'challenge-1',
      attestAlias: 'wallet.p256.attest',
      createdAt: '2026-08-04T00:00:00.000Z',
    })

    expect(decideActivationRetry(readWalletActivationTransaction(), 'challenge-2', true)).toEqual({
      action: 'noop',
      reason: 'already_activated',
    })
  })

  test('decideActivationRetry recreates when artifacts are missing for same challenge', () => {
    mockStorage()
    startWalletActivationTransaction('challenge-1')
    markWalletActivationKeyCreated({
      challengeId: 'challenge-1',
      publicJwk: SAMPLE_JWK,
      certificateChainDer: [],
      securityLevelHint: 'STRONGBOX',
    })

    expect(decideActivationRetry(readWalletActivationTransaction(), 'challenge-1', true)).toEqual({
      action: 'recreate_key',
      reason: 'missing_artifacts',
    })
  })

  test('markWalletActivationWpRejected clears idempotency key and returns to key_created', () => {
    mockStorage()
    seedKeyCreatedTransaction()
    beginWalletActivationWpSubmission()
    const tx = markWalletActivationWpRejected()

    expect(tx.phase).toBe('key_created')
    expect(tx.submissionIdempotencyKey).toBeUndefined()
  })

  test('requireAttestationChallengeForProductionAttestCreate rejects missing challenge in production', () => {
    expect(() => requireAttestationChallengeForProductionAttestCreate(undefined, true)).toThrow(
      'AttestKeyChallengeRequired',
    )
    expect(() => requireAttestationChallengeForProductionAttestCreate(new Uint8Array([1]), true)).not.toThrow()
    expect(() => requireAttestationChallengeForProductionAttestCreate(undefined, false)).not.toThrow()
  })

  test('clearWalletActivationTransaction removes persisted tx', () => {
    mockStorage()
    startWalletActivationTransaction('challenge-1')
    clearWalletActivationTransaction()
    expect(readWalletActivationTransaction()).toBeUndefined()
  })
})
