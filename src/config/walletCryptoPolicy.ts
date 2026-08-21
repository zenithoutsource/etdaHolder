export const WALLET_CRYPTO_V2_META_KEY = 'wallet.crypto.v2_enabled'
export const WALLET_ATTEST_WUA_KEY = 'wallet.attest.wua'
export const WALLET_ATTEST_WIA_KEY = 'wallet.attest.wia'
export const WALLET_ATTEST_CHALLENGE_UNSUPPORTED_UNTIL_KEY = 'wallet.attest.challenge_unsupported_until'

const DEFAULT_CHALLENGE_UNSUPPORTED_TTL_MS = 3_600_000

export function readIssuancePendingKeyTtlMs(): number {
  return Number(process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS) || 1_800_000
}

/** Default on: P2 journey 12 / canvas 20 generates a new `did:key` per credential without Wallet Provider WUA. */
export function isPerCredentialSigningEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED
  return raw !== 'false' && raw !== '0'
}

/** Opt-in Wallet Provider WUA/WIA on OID4VCI credential request. Default off. */
export function isWalletAttestationRequested(): boolean {
  const raw = process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
  return raw === 'true' || raw === '1'
}

/** How long to skip hardware k_attest challenge POSTs after a peer WP 404. Unit: ms. Default: 3600000 (1 hour). */
export function readWalletAttestChallengeUnsupportedTtlMs(): number {
  return Number(process.env.EXPO_PUBLIC_WALLET_ATTEST_CHALLENGE_UNSUPPORTED_TTL_MS)
    || DEFAULT_CHALLENGE_UNSUPPORTED_TTL_MS
}

/** Wallet Provider challenge/attest POST timeout. Unit: ms. Default: 15000. */
export function readWalletAttestFetchTimeoutMs(): number {
  return Number(process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS) || 15_000
}

/**
 * Lifetime of a minted OAuth Client Attestation JWT used for
 * `attest_jwt_client_auth` when cached WP WUA is not that profile.
 * Unit: ms. Default: 3600000 (1 hour).
 */
export function readOid4vcClientAttestationTtlMs(): number {
  return Number(process.env.EXPO_PUBLIC_OID4VC_CLIENT_ATTESTATION_TTL_MS) || 3_600_000
}
