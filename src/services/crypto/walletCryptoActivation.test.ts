import { WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY, WALLET_CRYPTO_V2_META_KEY } from '@/src/config/walletCryptoPolicy'
import { getCredentialStorage, getMetaStorage } from '../storage/storage'
import {
  activateWalletCryptoV2,
  detectLegacySingleKeyWallet,
  isWalletCryptoV2Enabled,
  readCachedWalletAttestations,
} from './walletCryptoActivation'
import { __resetHardwareEcdsaSignerCacheForTests, __setHardwareEcdsaSignerForTests } from './hardwareEcdsaSigner'
import { createMockHardwareEcdsaSigner } from './hardwareEcdsaSigner.mock'
import { WALLET_P256_ATTEST_ALIAS } from './hardwareEcdsaTypes'
import {
  beginWalletActivationWpSubmission,
  markWalletActivationKeyCreated,
  readWalletActivationTransaction,
  startWalletActivationTransaction,
} from './walletActivationTransaction'
import { destroyWalletAttestKey } from './walletAttestKey'

jest.mock('../storage/storage', () => {
  const actual = jest.requireActual('../storage/storage')
  return {
    ...actual,
    getCredentialStorage: jest.fn(),
  }
})

jest.mock('./credentialKeyRegistry', () => ({
  listCredentialKeyRecords: jest.fn(() => []),
}))

jest.mock('../credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('./walletAttestKey', () => ({
  destroyWalletAttestKey: jest.fn(async () => undefined),
}))

const mockRequestAttestationChallenge = jest.fn()
const mockRequestAttestations = jest.fn()

jest.mock('./walletAttestClient', () => {
  const actual = jest.requireActual('./walletAttestClient') as typeof import('./walletAttestClient')
  return {
    ...actual,
    createWalletAttestClient: jest.fn(() => ({
      requestAttestationChallenge: (...args: unknown[]) => mockRequestAttestationChallenge(...args),
      requestAttestations: (...args: unknown[]) => mockRequestAttestations(...args),
    })),
  }
})

import { ED25519_PUBLIC_KEY_STORAGE } from './walletKeyRegistration'
import { listCredentialKeyRecords } from './credentialKeyRegistry'
import { readStoredCredentials } from '../credentials/storedCredentials'

const getCredentialStorageMock = getCredentialStorage as jest.Mock
const destroyWalletAttestKeyMock = destroyWalletAttestKey as jest.Mock

const SAMPLE_JWK = {
  kty: 'EC' as const,
  crv: 'P-256' as const,
  x: 'test-x',
  y: 'test-y',
}

function mockCredentialStorage() {
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

function challengeResponse(challengeId = 'challenge-1') {
  return {
    challengeId,
    attestationChallengeBase64: btoa(String.fromCharCode(1, 2, 3)),
    expiresAt: '2026-08-13T01:00:00.000Z',
  }
}

describe('walletCryptoActivation', () => {
  const originalWua = process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED

  beforeEach(() => {
    getMetaStorage().clearAll()
    jest.clearAllMocks()
    mockCredentialStorage()
    __resetHardwareEcdsaSignerCacheForTests()
    __setHardwareEcdsaSignerForTests(createMockHardwareEcdsaSigner(), 'mock')
    delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    mockRequestAttestationChallenge.mockResolvedValue(challengeResponse())
    mockRequestAttestations.mockResolvedValue({
      wua: 'wua.jwt.',
      wia: 'wia.jwt.',
      expiresAt: '2026-07-25T00:00:00.000Z',
    })
  })

  afterEach(() => {
    if (originalWua === undefined) {
      delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    } else {
      process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED = originalWua
    }
  })

  test('isWalletCryptoV2Enabled is false until activation succeeds', () => {
    expect(isWalletCryptoV2Enabled()).toBe(false)
    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    expect(isWalletCryptoV2Enabled()).toBe(true)
  })

  test('detectLegacySingleKeyWallet is true when v1 credentials exist without per-credential keys', () => {
    getMetaStorage().set(ED25519_PUBLIC_KEY_STORAGE, 'ed25519-public-key')
    ;(readStoredCredentials as jest.Mock).mockReturnValue([{ id: 'cred-1' }])
    ;(listCredentialKeyRecords as jest.Mock).mockReturnValue([])
    expect(detectLegacySingleKeyWallet()).toBe(true)

    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    expect(detectLegacySingleKeyWallet()).toBe(false)
  })

  test('detectLegacySingleKeyWallet is false for fresh installs without credentials', () => {
    getMetaStorage().set(ED25519_PUBLIC_KEY_STORAGE, 'ed25519-public-key')
    ;(readStoredCredentials as jest.Mock).mockReturnValue([])
    expect(detectLegacySingleKeyWallet()).toBe(false)
  })

  test('activateWalletCryptoV2 creates hardware k_attest and submits chain', async () => {
    await activateWalletCryptoV2()

    expect(isWalletCryptoV2Enabled()).toBe(true)
    expect(readCachedWalletAttestations()).toEqual({
      wua: { value: 'wua.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
      wia: { value: 'wia.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
    })
    expect(mockRequestAttestationChallenge).toHaveBeenCalledTimes(1)
    expect(mockRequestAttestations).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'challenge-1',
        pubKAttestJwk: expect.objectContaining({ kty: 'EC', crv: 'P-256' }),
        submissionIdempotencyKey: expect.any(String),
      }),
    )
    expect(mockRequestAttestations.mock.calls[0][0].certificateChainDerBase64.length).toBeGreaterThan(0)
    expect(readWalletActivationTransaction()?.phase).toBe('activated')
    expect(destroyWalletAttestKeyMock).toHaveBeenCalledTimes(1)
  })

  test('activateWalletCryptoV2 skips when hardware k_attest is already activated', async () => {
    await activateWalletCryptoV2()
    jest.clearAllMocks()
    mockRequestAttestations.mockResolvedValue({
      wua: 'wua.jwt.',
      wia: 'wia.jwt.',
      expiresAt: '2026-07-25T00:00:00.000Z',
    })

    await activateWalletCryptoV2()

    expect(mockRequestAttestationChallenge).not.toHaveBeenCalled()
    expect(mockRequestAttestations).not.toHaveBeenCalled()
    expect(destroyWalletAttestKeyMock).not.toHaveBeenCalled()
  })

  test('activateWalletCryptoV2 resubmits wp_submit_pending without creating a new key', async () => {
    const signer = createMockHardwareEcdsaSigner()
    __setHardwareEcdsaSignerForTests(signer, 'mock')
    const created = await signer.createKey(WALLET_P256_ATTEST_ALIAS, {
      attestationChallenge: new Uint8Array([1, 2, 3]),
    })
    startWalletActivationTransaction('challenge-1')
    markWalletActivationKeyCreated({
      challengeId: 'challenge-1',
      publicJwk: created.publicJwk,
      certificateChainDer: created.certificateChainDer ?? [new Uint8Array([0x30])],
      securityLevelHint: created.securityLevel,
    })
    const pending = beginWalletActivationWpSubmission()

    await activateWalletCryptoV2()

    expect(mockRequestAttestationChallenge).not.toHaveBeenCalled()
    expect(mockRequestAttestations).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'challenge-1',
        submissionIdempotencyKey: pending.submissionIdempotencyKey,
        pubKAttestJwk: SAMPLE_JWK.kty === 'EC' ? expect.objectContaining({ kty: 'EC', crv: 'P-256' }) : SAMPLE_JWK,
      }),
    )
    expect(readWalletActivationTransaction()?.phase).toBe('activated')
  })

  test('activateWalletCryptoV2 leaves v2 disabled when attest fails', async () => {
    mockRequestAttestations.mockRejectedValue(new Error('WalletAttestRequestFailed:503'))

    await expect(activateWalletCryptoV2()).rejects.toThrow('WalletAttestRequestFailed:503')
    expect(isWalletCryptoV2Enabled()).toBe(false)
    expect(readCachedWalletAttestations()).toEqual({})
    expect(destroyWalletAttestKeyMock).not.toHaveBeenCalled()
    expect(readWalletActivationTransaction()?.phase).toBe('wp_submit_pending')
    expect(readWalletActivationTransaction()?.submissionIdempotencyKey).toEqual(expect.any(String))
  })

  test('activateWalletCryptoV2 resubmits the same idempotency key after an ambiguous WP failure', async () => {
    mockRequestAttestations.mockRejectedValueOnce(new Error('WalletAttestRequestFailed:503'))
    await expect(activateWalletCryptoV2()).rejects.toThrow('WalletAttestRequestFailed:503')
    const firstKey = readWalletActivationTransaction()?.submissionIdempotencyKey
    mockRequestAttestationChallenge.mockClear()
    mockRequestAttestations.mockResolvedValue({
      wua: 'wua.jwt.',
      wia: 'wia.jwt.',
      expiresAt: '2026-07-25T00:00:00.000Z',
    })

    await activateWalletCryptoV2()

    expect(mockRequestAttestationChallenge).not.toHaveBeenCalled()
    expect(mockRequestAttestations).toHaveBeenCalledWith(
      expect.objectContaining({ submissionIdempotencyKey: firstKey }),
    )
    expect(readWalletActivationTransaction()?.phase).toBe('activated')
  })

  test('activateWalletCryptoV2 runs when v2 is already enabled but hardware alias is missing', async () => {
    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')

    await activateWalletCryptoV2()

    expect(mockRequestAttestationChallenge).toHaveBeenCalledTimes(1)
    expect(mockRequestAttestations).toHaveBeenCalledTimes(1)
    expect(readWalletActivationTransaction()?.phase).toBe('activated')
  })

  test('activateWalletCryptoV2 skips when the Wallet Provider has no challenge route', async () => {
    mockRequestAttestationChallenge.mockRejectedValue(new Error('WalletAttestChallengeNotFound:404'))

    await activateWalletCryptoV2()

    expect(isWalletCryptoV2Enabled()).toBe(false)
    expect(mockRequestAttestations).not.toHaveBeenCalled()
    expect(destroyWalletAttestKeyMock).not.toHaveBeenCalled()
    expect(readWalletActivationTransaction()).toBeUndefined()
    expect(Number(getMetaStorage().getString(WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY))).toBeGreaterThan(
      Date.now(),
    )
  })

  test('activateWalletCryptoV2 does not POST challenge again while 404 skip is cached', async () => {
    mockRequestAttestationChallenge.mockRejectedValue(new Error('WalletAttestChallengeNotFound:404'))
    await activateWalletCryptoV2()
    mockRequestAttestationChallenge.mockClear()

    await activateWalletCryptoV2()

    expect(mockRequestAttestationChallenge).not.toHaveBeenCalled()
  })

  test('activateWalletCryptoV2 fail-closes on challenge 404 when WUA is requested', async () => {
    process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED = 'true'
    mockRequestAttestationChallenge.mockRejectedValue(new Error('WalletAttestChallengeNotFound:404'))

    await expect(activateWalletCryptoV2()).rejects.toThrow('WalletAttestChallengeNotFound:404')
    expect(mockRequestAttestations).not.toHaveBeenCalled()
  })

  test('activateWalletCryptoV2 shares one in-flight challenge request', async () => {
    let releaseChallenge: ((value: ReturnType<typeof challengeResponse>) => void) | undefined
    mockRequestAttestationChallenge.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseChallenge = resolve
        }),
    )

    const first = activateWalletCryptoV2()
    const second = activateWalletCryptoV2()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockRequestAttestationChallenge).toHaveBeenCalledTimes(1)
    releaseChallenge?.(challengeResponse())
    await Promise.all([first, second])
    expect(mockRequestAttestationChallenge).toHaveBeenCalledTimes(1)
  })
})
