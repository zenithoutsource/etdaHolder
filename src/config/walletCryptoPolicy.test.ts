import {
  isPerCredentialSigningEnabled,
  isWalletAttestationRequested,
  readIssuancePendingKeyTtlMs,
  readOid4vcClientAttestationTtlMs,
  readWalletAttestChallengeUnsupportedTtlMs,
  readWalletAttestFetchTimeoutMs,
  WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY,
  WALLET_ATTEST_WIA_KEY,
  WALLET_ATTEST_WUA_KEY,
  WALLET_CRYPTO_V2_META_KEY,
} from './walletCryptoPolicy'

describe('walletCryptoPolicy', () => {
  const originalTtl = process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS
  const originalPerCredential = process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED
  const originalAttest = process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
  const originalChallengeTtl = process.env.EXPO_PUBLIC_WALLET_ATTEST_CHALLENGE_UNSUPPORTED_TTL_MS
  const originalFetchTimeout = process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS
  const originalClientAttestationTtl = process.env.EXPO_PUBLIC_OID4VC_CLIENT_ATTESTATION_TTL_MS

  afterEach(() => {
    if (originalTtl === undefined) {
      delete process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS
    } else {
      process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS = originalTtl
    }
    if (originalPerCredential === undefined) {
      delete process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED = originalPerCredential
    }
    if (originalAttest === undefined) {
      delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    } else {
      process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED = originalAttest
    }
    if (originalChallengeTtl === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_ATTEST_CHALLENGE_UNSUPPORTED_TTL_MS
    } else {
      process.env.EXPO_PUBLIC_WALLET_ATTEST_CHALLENGE_UNSUPPORTED_TTL_MS = originalChallengeTtl
    }
    if (originalFetchTimeout === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS
    } else {
      process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS = originalFetchTimeout
    }
    if (originalClientAttestationTtl === undefined) {
      delete process.env.EXPO_PUBLIC_OID4VC_CLIENT_ATTESTATION_TTL_MS
    } else {
      process.env.EXPO_PUBLIC_OID4VC_CLIENT_ATTESTATION_TTL_MS = originalClientAttestationTtl
    }
  })

  test('readIssuancePendingKeyTtlMs defaults to 30 minutes', () => {
    delete process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS
    expect(readIssuancePendingKeyTtlMs()).toBe(1_800_000)
  })

  test('readIssuancePendingKeyTtlMs reads env override', () => {
    process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS = '600000'
    expect(readIssuancePendingKeyTtlMs()).toBe(600_000)
  })

  test('exports stable meta keys', () => {
    expect(WALLET_CRYPTO_V2_META_KEY).toBe('wallet.crypto.v2_enabled')
    expect(WALLET_ATTEST_WUA_KEY).toBe('wallet.attest.wua')
    expect(WALLET_ATTEST_WIA_KEY).toBe('wallet.attest.wia')
    expect(WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY).toBe('wallet.attest.challenge_unsupported_until')
  })

  test('keeps per-credential signing enabled when a legacy env override disables it', () => {
    process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED = 'false'
    expect(isPerCredentialSigningEnabled()).toBe(true)
  })

  test('isWalletAttestationRequested defaults off', () => {
    delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    expect(isWalletAttestationRequested()).toBe(false)
  })

  test('readWalletAttestChallengeUnsupportedTtlMs defaults to 1 hour', () => {
    delete process.env.EXPO_PUBLIC_WALLET_ATTEST_CHALLENGE_UNSUPPORTED_TTL_MS
    expect(readWalletAttestChallengeUnsupportedTtlMs()).toBe(3_600_000)
  })

  test('readWalletAttestFetchTimeoutMs defaults to 15 seconds', () => {
    delete process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS
    expect(readWalletAttestFetchTimeoutMs()).toBe(15_000)
  })

  test('readOid4vcClientAttestationTtlMs defaults to 1 hour', () => {
    delete process.env.EXPO_PUBLIC_OID4VC_CLIENT_ATTESTATION_TTL_MS
    expect(readOid4vcClientAttestationTtlMs()).toBe(3_600_000)
  })
})
